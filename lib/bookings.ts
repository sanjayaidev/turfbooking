import crypto from 'node:crypto';
import { PoolClient } from 'pg';
import { q, q1, tx, expireStale } from './db';
import { addDays, dowOf, isDateStr, istDate, tsOf } from './time';
import { evalCoupon, priceQuote } from './pricing';
import { loadRules } from './slots';
import { getSettings, refundPercentFor } from './settings';
import { buildEmail, flushQueuedEmails, queueEmail } from './email';

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const token = () => crypto.randomBytes(18).toString('base64url');

async function nextRef(c: PoolClient): Promise<string> {
  const day = istDate();
  const r = await c.query('INSERT INTO ref_counters(day,n) VALUES ($1,1) ON CONFLICT (day) DO UPDATE SET n = ref_counters.n + 1 RETURNING n', [day]);
  return `SBL-CRT-${day.replaceAll('-', '')}-${String(r.rows[0].n).padStart(4, '0')}`;
}

async function emailContext(c: PoolClient, bookingId: string) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1', [bookingId])).rows[0];
  const t = (await c.query('SELECT * FROM turfs WHERE id=$1', [b.turf_id])).rows[0];
  const s = await getSettings();
  return { booking: b, turf: t, business: { ...s.business, phone: t.phone || s.business.phone } };
}

async function lookupCoupon(c: PoolClient, code: string | null | undefined) {
  if (!code) return null;
  const r = await c.query('SELECT * FROM coupons WHERE upper(code)=upper($1)', [code.trim()]);
  return r.rows[0] || null;
}

export type ReserveInput = {
  turfId: string; date: string; startMin: number; duration: number;
  customer: { name: string; phone: string; email?: string | null };
  userId?: string | null; source: 'online' | 'admin'; createdBy?: string | null;
  couponCode?: string | null; notes?: string | null;
  /** admin manual bookings are confirmed immediately */
  confirmNow?: { paid: boolean; method: string } | null;
};

/**
 * Creates a booking. Everything is validated here on the server:
 * duration, hours, blocks, lead time, price, coupon. The overlap guarantee comes from the
 * Postgres EXCLUDE constraint, so two simultaneous requests can never both succeed.
 */
export async function reserveSlot(inp: ReserveInput) {
  const out = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [inp.turfId]); // serialises block checks per turf
    await expireStale(c);

    const turf = (await c.query('SELECT * FROM turfs WHERE id=$1', [inp.turfId])).rows[0];
    if (!turf || turf.status !== 'active') throw new BookingError('This turf is not available for booking.', 404);
    if (!isDateStr(inp.date)) throw new BookingError('Please choose a valid date.');
    if (!turf.durations.includes(inp.duration)) throw new BookingError('That duration is not offered for this turf.');
    if (!Number.isInteger(inp.startMin) || inp.startMin % turf.slot_interval !== 0) throw new BookingError('Invalid start time.');

    const hours = (await c.query('SELECT * FROM operating_hours WHERE turf_id=$1 AND dow=$2', [turf.id, dowOf(inp.date)])).rows[0];
    if (!hours || hours.is_closed || inp.startMin < hours.open_min || inp.startMin + inp.duration > hours.close_min)
      throw new BookingError('The turf is closed during that time.');

    const settings = await getSettings();
    const start = tsOf(inp.date, inp.startMin);
    const end = new Date(start.getTime() + inp.duration * 60000);
    const now = Date.now();
    if (inp.source === 'online') {
      if (start.getTime() < now + settings.booking.minLeadMinutes * 60000) throw new BookingError('That time has already passed or is too close to start. Please pick a later slot.');
      if (inp.date > addDays(istDate(), settings.booking.windowDays)) throw new BookingError(`Bookings open up to ${settings.booking.windowDays} days in advance.`);
    } else if (end.getTime() <= now) {
      throw new BookingError('That slot is already over.');
    }

    const blocked = (await c.query('SELECT reason FROM blocks WHERE turf_id=$1 AND start_ts < $3 AND end_ts > $2 LIMIT 1', [turf.id, start, end])).rows[0];
    if (blocked) throw new BookingError('This slot is not available (blocked by the turf).', 409, 'blocked');

    // pricing, server side only
    const rules = await loadRules(turf.id);
    const quote = priceQuote(turf, rules, inp.date, inp.startMin, inp.duration);
    let couponDiscount = 0;
    let couponCode: string | null = null;
    if (inp.couponCode) {
      const coupon = await lookupCoupon(c, inp.couponCode);
      const ev = evalCoupon(coupon, turf.id, istDate(), quote.afterPromo);
      if (!ev.ok) throw new BookingError(ev.error || 'Invalid coupon', 400, 'coupon');
      couponDiscount = ev.discount;
      couponCode = coupon.code;
    }
    const discount = quote.promo + couponDiscount;
    const total = Math.max(0, quote.subtotal - discount);

    // one active hold per customer: starting a new checkout releases their old one
    if (inp.source === 'online' && inp.userId) {
      await c.query("UPDATE bookings SET status='expired' WHERE user_id=$1 AND status='reserved'", [inp.userId]);
    }

    let id: string;
    try {
      const ins = await c.query(
        `INSERT INTO bookings(turf_id,user_id,customer_name,customer_phone,customer_email,start_ts,end_ts,duration_min,status,payment_status,subtotal,discount,total,coupon_code,source,expires_at,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'reserved','pending',$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [turf.id, inp.userId ?? null, inp.customer.name, inp.customer.phone, inp.customer.email || null, start, end, inp.duration,
          quote.subtotal, discount, total, couponCode, inp.source,
          inp.confirmNow ? null : new Date(now + settings.booking.lockMinutes * 60000), inp.notes ?? null, inp.createdBy ?? null],
      );
      id = ins.rows[0].id;
    } catch (e: any) {
      if (e.code === '23P01') throw new BookingError('Sorry, this slot was just taken by someone else. Please choose another time.', 409, 'slot_taken');
      throw e;
    }

    if (inp.confirmNow) {
      await confirmInTx(c, id, { method: inp.confirmNow.method, txnId: null, paid: inp.confirmNow.paid });
    }
    return id;
  });
  void flushQueuedEmails();
  return out;
}

export async function confirmInTx(c: PoolClient, bookingId: string, p: { method: string; txnId: string | null; paid: boolean }) {
  const ref = await nextRef(c);
  await c.query(
    `UPDATE bookings SET status='confirmed', payment_status=$2, ref=$3, checkin_token=$4, expires_at=NULL WHERE id=$1`,
    [bookingId, p.paid ? 'successful' : 'pending', ref, token()],
  );
  const b = (await c.query('SELECT total, coupon_code FROM bookings WHERE id=$1', [bookingId])).rows[0];
  if (p.paid) {
    await c.query(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id) VALUES ($1,'payment','demo',$2,$3,'successful',$4)`,
      [bookingId, p.method, b.total, p.txnId || 'demo_pay_' + crypto.randomBytes(5).toString('hex')]);
  }
  if (b.coupon_code) await c.query('UPDATE coupons SET used_count = used_count + 1 WHERE upper(code)=upper($1)', [b.coupon_code]);
  const ctx = await emailContext(c, bookingId);
  const mail = buildEmail('booking_confirmed', ctx, { txnId: p.txnId });
  await queueEmail(c, bookingId, 'booking_confirmed', ctx.booking.customer_email, mail.subject, mail.html);
}

/** Replaces the coupon on a reserved booking and re-prices it (server side). */
export async function applyCouponToBooking(bookingId: string, userId: string, code: string | null) {
  return tx(async (c) => {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    if (!b || b.user_id !== userId) throw new BookingError('Booking not found.', 404);
    if (b.status !== 'reserved') throw new BookingError('This reservation is no longer active.', 409);
    const turf = (await c.query('SELECT * FROM turfs WHERE id=$1', [b.turf_id])).rows[0];
    const date = istDate(b.start_ts);
    const startMin = Math.round((b.start_ts.getTime() - tsOf(date, 0).getTime()) / 60000);
    const quote = priceQuote(turf, await loadRules(turf.id), date, startMin, b.duration_min);
    let couponDiscount = 0, couponCode: string | null = null;
    if (code) {
      const coupon = await lookupCoupon(c, code);
      const ev = evalCoupon(coupon, turf.id, istDate(), quote.afterPromo);
      if (!ev.ok) throw new BookingError(ev.error || 'Invalid coupon', 400, 'coupon');
      couponDiscount = ev.discount; couponCode = coupon.code;
    }
    const discount = quote.promo + couponDiscount;
    await c.query('UPDATE bookings SET coupon_code=$2, discount=$3, total=$4, subtotal=$5 WHERE id=$1', [bookingId, couponCode, discount, quote.subtotal - discount, quote.subtotal]);
    return { total: quote.subtotal - discount, discount, coupon: couponCode };
  });
}

/**
 * Demo payment. This is the seam where Razorpay plugs in later:
 *  1) create order  2) verify signature on the server  3) call confirmInTx.
 * The booking only becomes CONFIRMED here, after the (simulated) server-side verification.
 */
export async function payBooking(bookingId: string, userId: string, outcome: 'success' | 'fail', method: string) {
  const res = await tx(async (c) => {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    if (!b || b.user_id !== userId) throw new BookingError('Booking not found.', 404);
    if (b.status === 'confirmed') return { status: 'confirmed' as const, already: true };
    if (b.status !== 'reserved') throw new BookingError('This reservation has expired. Please start again.', 410, 'expired');
    if (b.expires_at && new Date(b.expires_at).getTime() < Date.now()) {
      await c.query("UPDATE bookings SET status='expired' WHERE id=$1", [bookingId]);
      await c.query('COMMIT'); await c.query('BEGIN');
      throw new BookingError('Your 10-minute hold has expired and the slot was released. Please start again.', 410, 'expired');
    }
    const txn = 'demo_pay_' + crypto.randomBytes(6).toString('hex');
    if (outcome === 'success') {
      await confirmInTx(c, bookingId, { method, txnId: txn, paid: true });
      return { status: 'confirmed' as const, already: false };
    }
    await c.query(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,note) VALUES ($1,'payment','demo',$2,$3,'failed',$4,'Simulated failure')`, [bookingId, method, b.total, txn]);
    await c.query("UPDATE bookings SET payment_status='failed' WHERE id=$1", [bookingId]);
    const ctx = await emailContext(c, bookingId);
    const mail = buildEmail('payment_failed', ctx);
    await queueEmail(c, bookingId, 'payment_failed', ctx.booking.customer_email, mail.subject, mail.html);
    return { status: 'failed' as const, already: false };
  });
  void flushQueuedEmails();
  return res;
}

export async function releaseHold(bookingId: string, userId: string) {
  await q("UPDATE bookings SET status='expired' WHERE id=$1 AND user_id=$2 AND status='reserved'", [bookingId, userId]);
}

type CancelActor = { type: 'customer' | 'admin'; userId: string; name?: string };

export async function cancelBooking(bookingId: string, actor: CancelActor, opts: { refundAmount?: number; reason?: string } = {}) {
  const res = await tx(async (c) => {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    if (!b) throw new BookingError('Booking not found.', 404);
    if (actor.type === 'customer' && b.user_id !== actor.userId) throw new BookingError('Booking not found.', 404);
    if (b.status === 'cancelled' || b.status === 'expired') throw new BookingError('This booking is already cancelled.', 409);
    if (b.status === 'reserved') {
      await c.query("UPDATE bookings SET status='cancelled', cancelled_at=now(), cancelled_by=$2 WHERE id=$1", [bookingId, actor.type]);
      return { refund: 0 };
    }
    const settings = await getSettings();
    let refund = 0;
    const paid = b.payment_status === 'successful';
    if (actor.type === 'customer') {
      if (!settings.cancellation.enabled) throw new BookingError('Online cancellation is not available. Please contact the turf.', 403);
      const hours = (new Date(b.start_ts).getTime() - Date.now()) / 3600000;
      if (hours <= 0) throw new BookingError('This booking has already started and cannot be cancelled.', 409);
      refund = paid ? Math.round((b.total * refundPercentFor(settings.cancellation, hours)) / 100) : 0;
    } else {
      refund = paid ? Math.min(Math.max(0, Math.round(opts.refundAmount ?? 0)), b.total) : 0;
    }
    const pay = refund <= 0 ? b.payment_status : refund >= b.total ? 'refunded' : 'partially_refunded';
    await c.query(
      `UPDATE bookings SET status='cancelled', cancelled_at=now(), cancelled_by=$2, cancel_reason=$3, refund_amount=$4, payment_status=$5 WHERE id=$1`,
      [bookingId, actor.type, opts.reason || null, refund, pay],
    );
    if (refund > 0) {
      await c.query(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,note) VALUES ($1,'refund','demo','Original method',$2,'successful',$3,$4)`,
        [bookingId, refund, 'demo_rf_' + crypto.randomBytes(5).toString('hex'), opts.reason || 'Cancellation refund']);
    }
    const ctx = await emailContext(c, bookingId);
    const mail = buildEmail('booking_cancelled', ctx);
    await queueEmail(c, bookingId, 'booking_cancelled', ctx.booking.customer_email, mail.subject, mail.html);
    return { refund };
  });
  void flushQueuedEmails();
  return res;
}

/** Record an extra refund against an already-cancelled booking (admin). */
export async function recordRefund(bookingId: string, amount: number, note: string) {
  return tx(async (c) => {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    if (!b) throw new BookingError('Booking not found.', 404);
    const amt = Math.round(amount);
    if (!(amt > 0)) throw new BookingError('Enter a refund amount above zero.');
    if (b.refund_amount + amt > b.total) throw new BookingError(`Refund cannot exceed the amount paid (₹${b.total}).`);
    const total = b.refund_amount + amt;
    await c.query('UPDATE bookings SET refund_amount=$2, payment_status=$3 WHERE id=$1', [bookingId, total, total >= b.total ? 'refunded' : 'partially_refunded']);
    await c.query(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,note) VALUES ($1,'refund','demo','Manual',$2,'successful',$3,$4)`,
      [bookingId, amt, 'demo_rf_' + crypto.randomBytes(5).toString('hex'), note || 'Manual refund']);
  });
}

export type CheckinResult = { result: 'ok' | 'already' | 'invalid' | 'cancelled' | 'unpaid'; booking?: any };

export async function lookupByToken(tok: string) {
  return q1<any>(
    `SELECT b.*, t.name AS turf_name, t.address AS turf_address FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.checkin_token=$1`,
    [tok],
  );
}

export async function checkIn(tok: string, userId: string): Promise<CheckinResult> {
  const b = await lookupByToken(tok);
  if (!b) return { result: 'invalid' };
  if (b.status !== 'confirmed') return { result: 'cancelled', booking: b };
  if (b.checked_in_at) return { result: 'already', booking: b };
  const r = await q1<any>('UPDATE bookings SET checked_in_at=now(), checked_in_by=$2 WHERE id=$1 AND checked_in_at IS NULL RETURNING checked_in_at', [b.id, userId]);
  if (!r) return { result: 'already', booking: b };
  return { result: 'ok', booking: { ...b, checked_in_at: r.checked_in_at } };
}
