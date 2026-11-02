'use server';
import { revalidatePath } from 'next/cache';
import { q, q1, tx } from '@/lib/db';
import { audit, hashPassword, normPhone, PERMISSIONS, requirePerm, validEmail, validPhone } from '@/lib/auth';
import { BookingError, cancelBooking, checkIn, recordRefund } from '@/lib/bookings';
import { back, lines, num, slugify, str } from '@/lib/form';
import { IST } from '@/lib/time';

/* ───────────── bookings ───────────── */
export async function adminCancelBooking(fd: FormData) {
  const u = await requirePerm('bookings.cancel');
  const id = str(fd, 'id'); const path = `/admin/bookings/${id}`;
  try {
    const r = await cancelBooking(id, { type: 'admin', userId: u.id }, { refundAmount: num(fd, 'refund'), reason: str(fd, 'reason') || 'Cancelled by admin' });
    await audit(u, 'booking.cancel', 'booking', id, { refund: r.refund, reason: str(fd, 'reason') });
  } catch (e) { if (e instanceof BookingError) back(path, e.message, true); throw e; }
  back(path, 'Booking cancelled. The slot is open again.');
}
export async function adminRecordRefund(fd: FormData) {
  const u = await requirePerm('bookings.cancel');
  const id = str(fd, 'id'); const path = `/admin/bookings/${id}`;
  try { await recordRefund(id, num(fd, 'amount'), str(fd, 'note')); await audit(u, 'booking.refund', 'booking', id, { amount: num(fd, 'amount') }); }
  catch (e) { if (e instanceof BookingError) back(path, e.message, true); throw e; }
  back(path, 'Refund recorded.');
}
export async function adminMarkPaid(fd: FormData) {
  const u = await requirePerm('bookings.create');
  const id = str(fd, 'id'); const path = `/admin/bookings/${id}`;
  await tx(async (c) => {
    const b = (await c.query("SELECT total,payment_status,status FROM bookings WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!b || b.status !== 'confirmed' || b.payment_status === 'successful') return;
    await c.query("UPDATE bookings SET payment_status='successful' WHERE id=$1", [id]);
    await c.query("INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,note) VALUES ($1,'payment','manual',$2,$3,'successful',$4,'Collected at venue')", [id, str(fd, 'method') || 'Cash', b.total, 'manual_' + Date.now().toString(36)]);
  });
  await audit(u, 'booking.mark_paid', 'booking', id, null);
  back(path, 'Payment recorded.');
}
export async function adminCheckIn(fd: FormData) {
  const u = await requirePerm('checkin');
  const id = str(fd, 'id'); const path = `/admin/bookings/${id}`;
  const b = await q1<any>('SELECT checkin_token FROM bookings WHERE id=$1', [id]);
  if (!b?.checkin_token) back(path, 'This booking cannot be checked in.', true);
  const r = await checkIn(b.checkin_token, u.id);
  if (r.result === 'ok') await audit(u, 'booking.checkin', 'booking', id, null);
  back(path, r.result === 'ok' ? 'Customer checked in.' : r.result === 'already' ? 'Already checked in.' : 'Cannot check in a cancelled booking.', r.result !== 'ok');
}

/* ───────────── turfs ───────────── */
export async function createTurf(fd: FormData) {
  const u = await requirePerm('turfs.manage');
  const name = str(fd, 'name');
  if (name.length < 2) back('/admin/turfs', 'Enter a turf name.', true);
  let slug = slugify(name);
  if (await q1('SELECT 1 FROM turfs WHERE slug=$1', [slug])) slug += '-' + Math.random().toString(36).slice(2, 5);
  const t = await q1<any>(
    `INSERT INTO turfs(slug,name,tagline,description,sport,address,city,images,amenities,durations,sort_order)
     VALUES ($1,$2,'New turf','Describe this turf in the admin panel.',$3,'Sambalpur, Odisha','Sambalpur',$4,$5,'{60,90,120}',(SELECT coalesce(max(sort_order),0)+1 FROM turfs)) RETURNING id`,
    [slug, name, str(fd, 'sport') || 'Cricket', ['/img/turf-stripes.svg'], ['Parking', 'Drinking Water']]);
  for (let d = 0; d < 7; d++) await q('INSERT INTO operating_hours(turf_id,dow,open_min,close_min) VALUES ($1,$2,360,1380)', [t.id, d]);
  await audit(u, 'turf.create', 'turf', t.id, { name });
  back(`/admin/turfs/${t.id}`, 'Turf created. Fill in the details below.');
}
export async function updateTurf(fd: FormData) {
  const u = await requirePerm('turfs.manage');
  const id = str(fd, 'id'); const path = `/admin/turfs/${id}?tab=details`;
  const interval = [15, 30, 60].includes(num(fd, 'slot_interval')) ? num(fd, 'slot_interval') : 30;
  const durations = fd.getAll('durations').map((d) => parseInt(String(d), 10)).filter((d) => d >= 15 && d <= 480 && d % interval === 0).sort((a, b) => a - b);
  if (!durations.length) back(path, `Select at least one duration (multiples of ${interval} minutes).`, true);
  if (str(fd, 'name').length < 2) back(path, 'Turf name is required.', true);
  await q(
    `UPDATE turfs SET name=$2,tagline=$3,description=$4,sport=$5,address=$6,city=$7,map_query=$8,phone=$9,email=$10,images=$11,amenities=$12,status=$13,slot_interval=$14,durations=$15 WHERE id=$1`,
    [id, str(fd, 'name'), str(fd, 'tagline'), str(fd, 'description'), str(fd, 'sport') || 'Cricket', str(fd, 'address'), str(fd, 'city'), str(fd, 'map_query'), str(fd, 'phone'), str(fd, 'email'),
      lines(fd, 'images'), lines(fd, 'amenities'), str(fd, 'status') === 'inactive' ? 'inactive' : 'active', interval, durations]);
  await audit(u, 'turf.update', 'turf', id, null);
  revalidatePath('/', 'layout');
  back(path, 'Turf details saved.');
}
/**
 * Permanently deletes a turf (and its hours, pricing rules, blocks and turf-only coupons).
 * Refused while ANY booking exists for it, so booking and payment history is never destroyed;
 * hide the turf instead in that case. The database foreign key is the final guard.
 */
export async function deleteTurf(fd: FormData) {
  const u = await requirePerm('turfs.manage');
  const id = str(fd, 'id'); const path = `/admin/turfs/${id}?tab=details`;
  const t = await q1<any>('SELECT id,name FROM turfs WHERE id=$1', [id]);
  if (!t) back('/admin/turfs', 'That turf no longer exists.', true);
  if (str(fd, 'confirm').toLowerCase() !== String(t.name).toLowerCase()) back(path, 'To delete, type the turf name exactly as shown.', true);
  const used = await q1<any>('SELECT count(*)::int AS n FROM bookings WHERE turf_id=$1', [id]);
  if (used && used.n > 0) back(path, `This turf has ${used.n} booking(s), so it cannot be deleted. Set its status to "Hidden from customers" instead.`, true);
  try {
    await q('DELETE FROM turfs WHERE id=$1', [id]);
  } catch (e: any) {
    if (e?.code === '23503') back(path, 'A booking was just made for this turf, so it was not deleted.', true);
    throw e;
  }
  await audit(u, 'turf.delete', 'turf', id, { name: t.name });
  revalidatePath('/', 'layout');
  back('/admin/turfs', `Turf "${t.name}" deleted.`);
}
export async function updateHours(fd: FormData) {
  const u = await requirePerm('turfs.manage');
  const id = str(fd, 'id'); const path = `/admin/turfs/${id}?tab=hours`;
  for (let d = 0; d < 7; d++) {
    const open = num(fd, `open_${d}`), close = num(fd, `close_${d}`), closed = fd.get(`closed_${d}`) === 'on';
    if (!closed && close <= open) back(path, 'Closing time must be after opening time.', true);
    await q('INSERT INTO operating_hours(turf_id,dow,open_min,close_min,is_closed) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (turf_id,dow) DO UPDATE SET open_min=$3,close_min=$4,is_closed=$5', [id, d, open, close, closed]);
  }
  await audit(u, 'turf.hours', 'turf', id, null);
  back(path, 'Operating hours saved.');
}
export async function updatePricing(fd: FormData) {
  const u = await requirePerm('pricing.manage');
  const id = str(fd, 'id'); const path = `/admin/turfs/${id}?tab=pricing`;
  const wk = num(fd, 'weekday_rate'), we = num(fd, 'weekend_rate'), promo = num(fd, 'promo_percent');
  if (wk < 0 || we < 0 || promo < 0 || promo > 90) back(path, 'Please enter valid amounts (promo between 0 and 90%).', true);
  await q('UPDATE turfs SET weekday_rate=$2, weekend_rate=$3, promo_percent=$4, promo_label=$5 WHERE id=$1', [id, wk, we, promo, str(fd, 'promo_label') || null]);
  await audit(u, 'pricing.update', 'turf', id, { wk, we, promo });
  back(path, 'Base pricing saved. New bookings use these rates immediately.');
}
export async function addRule(fd: FormData) {
  const u = await requirePerm('pricing.manage');
  const id = str(fd, 'id'); const path = `/admin/turfs/${id}?tab=pricing`;
  const kind = ['peak', 'offpeak', 'holiday'].includes(str(fd, 'kind')) ? str(fd, 'kind') : 'peak';
  const days = fd.getAll('days').map((d) => parseInt(String(d), 10));
  const start = num(fd, 'start_min'), end = num(fd, 'end_min', 1440), rate = num(fd, 'rate');
  if (!str(fd, 'name')) back(path, 'Give the rule a name.', true);
  if (end <= start) back(path, 'End time must be after start time.', true);
  if (!(rate > 0)) back(path, 'Enter an hourly rate.', true);
  if (kind === 'holiday' && !str(fd, 'date_from')) back(path, 'Choose the holiday date.', true);
  await q('INSERT INTO pricing_rules(turf_id,name,kind,days,date_from,date_to,start_min,end_min,rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, str(fd, 'name'), kind, kind === 'holiday' || !days.length ? null : days, kind === 'holiday' ? str(fd, 'date_from') : null, kind === 'holiday' ? str(fd, 'date_to') || str(fd, 'date_from') : null, start, end, rate]);
  await audit(u, 'pricing.rule_add', 'turf', id, { name: str(fd, 'name'), kind, rate });
  back(path, 'Pricing rule added.');
}
export async function toggleRule(fd: FormData) {
  const u = await requirePerm('pricing.manage');
  const id = str(fd, 'id'), turf = str(fd, 'turf');
  await q('UPDATE pricing_rules SET active = NOT active WHERE id=$1', [id]);
  await audit(u, 'pricing.rule_toggle', 'pricing_rule', id, null);
  back(`/admin/turfs/${turf}?tab=pricing`, 'Rule updated.');
}
export async function deleteRule(fd: FormData) {
  const u = await requirePerm('pricing.manage');
  const id = str(fd, 'id'), turf = str(fd, 'turf');
  await q('DELETE FROM pricing_rules WHERE id=$1', [id]);
  await audit(u, 'pricing.rule_delete', 'pricing_rule', id, null);
  back(`/admin/turfs/${turf}?tab=pricing`, 'Rule deleted.');
}

/* ───────────── blocks & maintenance ───────────── */
export async function addBlock(fd: FormData) {
  const u = await requirePerm('blocks');
  const turf = str(fd, 'turf'); const path = `/admin/turfs/${turf}?tab=blocks`;
  const s = str(fd, 'start'), e = str(fd, 'end');
  if (!s || !e) back(path, 'Choose a start and end.', true);
  const start = new Date(`${s}:00${IST}`), end = new Date(`${e}:00${IST}`);
  if (!(end > start)) back(path, 'End must be after start.', true);
  const clash = await q1<any>("SELECT count(*)::int AS n FROM bookings WHERE turf_id=$1 AND status IN ('reserved','confirmed') AND start_ts < $3 AND end_ts > $2", [turf, start, end]);
  if (clash.n > 0) back(path, `${clash.n} booking(s) already fall in this period. Cancel or move them first, then block the slot.`, true);
  const b = await q1<any>('INSERT INTO blocks(turf_id,kind,start_ts,end_ts,reason,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [turf, str(fd, 'kind') === 'maintenance' ? 'maintenance' : 'block', start, end, str(fd, 'reason') || null, u.id]);
  await audit(u, 'block.add', 'turf', turf, { start: s, end: e, kind: str(fd, 'kind') });
  back(path, 'Slots blocked. Customers can no longer book this period.');
}
export async function deleteBlock(fd: FormData) {
  const u = await requirePerm('blocks');
  const id = str(fd, 'id'), turf = str(fd, 'turf');
  await q('DELETE FROM blocks WHERE id=$1', [id]);
  await audit(u, 'block.delete', 'turf', turf, null);
  back(`/admin/turfs/${turf}?tab=blocks`, 'Block removed. Slots are bookable again.');
}

/* ───────────── coupons ───────────── */
export async function saveCoupon(fd: FormData) {
  const u = await requirePerm('coupons.manage');
  const code = str(fd, 'code').toUpperCase().replace(/\s+/g, '');
  const type = str(fd, 'discount_type') === 'flat' ? 'flat' : 'percent';
  const value = num(fd, 'value');
  if (code.length < 3) back('/admin/coupons', 'Coupon code must be at least 3 characters.', true);
  if (!(value > 0) || (type === 'percent' && value > 100)) back('/admin/coupons', 'Enter a valid discount value.', true);
  try {
    await q(`INSERT INTO coupons(code,description,discount_type,value,max_discount,min_amount,turf_id,valid_from,valid_to,usage_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [code, str(fd, 'description') || null, type, value, str(fd, 'max_discount') ? num(fd, 'max_discount') : null, num(fd, 'min_amount'), str(fd, 'turf_id') || null, str(fd, 'valid_from') || null, str(fd, 'valid_to') || null, str(fd, 'usage_limit') ? num(fd, 'usage_limit') : null]);
  } catch (e: any) { if (e.code === '23505') back('/admin/coupons', 'That coupon code already exists.', true); throw e; }
  await audit(u, 'coupon.create', 'coupon', code, null);
  back('/admin/coupons', `Coupon ${code} created.`);
}
export async function toggleCoupon(fd: FormData) {
  const u = await requirePerm('coupons.manage');
  await q('UPDATE coupons SET active = NOT active WHERE id=$1', [str(fd, 'id')]);
  await audit(u, 'coupon.toggle', 'coupon', str(fd, 'id'), null);
  back('/admin/coupons', 'Coupon updated.');
}
export async function deleteCoupon(fd: FormData) {
  const u = await requirePerm('coupons.manage');
  await q('DELETE FROM coupons WHERE id=$1', [str(fd, 'id')]);
  await audit(u, 'coupon.delete', 'coupon', str(fd, 'id'), null);
  back('/admin/coupons', 'Coupon deleted.');
}

/* ───────────── staff (admin only) ───────────── */
const permKeys = PERMISSIONS.map((p) => p.key);
export async function createStaff(fd: FormData) {
  const u = await requirePerm('admin');
  const name = str(fd, 'name'), email = str(fd, 'email').toLowerCase(), phone = normPhone(str(fd, 'phone')), pw = str(fd, 'password');
  const role = str(fd, 'role') === 'admin' ? 'admin' : 'staff';
  if (name.length < 2) back('/admin/staff', 'Enter a name.', true);
  if (!validEmail(email)) back('/admin/staff', 'Enter a valid email.', true);
  if (phone && !validPhone(phone)) back('/admin/staff', 'Enter a valid 10-digit mobile or leave it blank.', true);
  if (pw.length < 8) back('/admin/staff', 'Password must be at least 8 characters.', true);
  const perms = fd.getAll('perm').map(String).filter((p) => permKeys.includes(p));
  try {
    await q("INSERT INTO users(name,email,phone,password_hash,role,permissions) VALUES ($1,$2,$3,$4,$5,$6)", [name, email, phone || null, await hashPassword(pw), role, role === 'admin' ? [] : perms]);
  } catch (e: any) { if (e.code === '23505') back('/admin/staff', 'A user with this email already exists.', true); throw e; }
  await audit(u, 'staff.create', 'user', email, { role });
  back('/admin/staff', `${role === 'admin' ? 'Admin' : 'Staff member'} ${name} added.`);
}
export async function updateStaff(fd: FormData) {
  const u = await requirePerm('admin');
  const id = str(fd, 'id');
  const perms = fd.getAll('perm').map(String).filter((p) => permKeys.includes(p));
  const active = fd.get('active') === 'on';
  if (id === u.id && !active) back('/admin/staff', 'You cannot deactivate your own account.', true);
  await q('UPDATE users SET name=$2, permissions=$3, active=$4 WHERE id=$1', [id, str(fd, 'name'), perms, active]);
  if (str(fd, 'password')) {
    if (str(fd, 'password').length < 8) back('/admin/staff', 'New password must be at least 8 characters.', true);
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [id, await hashPassword(str(fd, 'password'))]);
  }
  await audit(u, 'staff.update', 'user', id, { perms, active });
  back('/admin/staff', 'Staff member updated.');
}

/* ───────────── settings (admin only) ───────────── */
export async function saveBusiness(fd: FormData) {
  const u = await requirePerm('admin');
  const v = { name: str(fd, 'name') || 'TurfBooking', tagline: str(fd, 'tagline'), phone: str(fd, 'phone'), email: str(fd, 'email'), address: str(fd, 'address'), whatsapp: str(fd, 'whatsapp') };
  await q("INSERT INTO settings(key,value) VALUES ('business',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [v]);
  await audit(u, 'settings.business', 'settings', 'business', null);
  revalidatePath('/', 'layout');
  back('/admin/settings', 'Business details saved.');
}
export async function saveCancellation(fd: FormData) {
  const u = await requirePerm('admin');
  const rules: { hoursBefore: number; refundPercent: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const h = str(fd, `h_${i}`), p = str(fd, `p_${i}`);
    if (h !== '' && p !== '') rules.push({ hoursBefore: Math.max(0, num(fd, `h_${i}`)), refundPercent: Math.min(100, Math.max(0, num(fd, `p_${i}`))) });
  }
  const v = { enabled: fd.get('enabled') === 'on', rules };
  await q("INSERT INTO settings(key,value) VALUES ('cancellation',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [v]);
  await audit(u, 'settings.cancellation', 'settings', 'cancellation', v);
  back('/admin/settings', v.enabled ? 'Cancellation policy saved and enabled for customers.' : 'Cancellation policy saved (customer self-cancel is OFF).');
}
export async function saveBookingSettings(fd: FormData) {
  const u = await requirePerm('admin');
  const v = { lockMinutes: Math.min(60, Math.max(2, num(fd, 'lockMinutes', 10))), windowDays: Math.min(365, Math.max(1, num(fd, 'windowDays', 60))), minLeadMinutes: Math.min(1440, Math.max(0, num(fd, 'minLeadMinutes', 30))) };
  await q("INSERT INTO settings(key,value) VALUES ('booking',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [v]);
  await audit(u, 'settings.booking', 'settings', 'booking', v);
  back('/admin/settings', 'Booking rules saved.');
}
