import { PoolClient } from 'pg';
import { q } from './db';
import { fmtDate, fmtDuration, fmtTime, inr } from './time';

type Ctx = { booking: any; turf: any; business: any };

const wrap = (business: any, title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#141a28">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#136444;color:#fff;padding:22px 24px;border-radius:14px 14px 0 0"><div style="font-size:13px;opacity:.8;letter-spacing:.08em;text-transform:uppercase">${business.name}</div><div style="font-size:22px;font-weight:700;margin-top:4px">${title}</div></div>
<div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e3e8e5;border-top:0">${body}
<p style="color:#667085;font-size:13px;margin-top:28px">Need help? Call ${business.phone || ''} or reply to this email.<br/>${business.name} · ${business.address || ''}</p></div></div></body></html>`;

const row = (k: string, v: string) => `<tr><td style="padding:8px 0;color:#667085;font-size:14px;width:150px">${k}</td><td style="padding:8px 0;font-size:14px;font-weight:600">${v}</td></tr>`;

function details({ booking: b, turf: t }: Ctx) {
  return `<table style="width:100%;border-collapse:collapse;border-top:1px solid #eceef2;margin-top:12px">
${row('Reference', b.ref || '—')}${row('Turf', t.name)}${row('Date', fmtDate(b.start_ts))}${row('Time', `${fmtTime(b.start_ts)} – ${fmtTime(b.end_ts)}`)}${row('Duration', fmtDuration(b.duration_min))}${row('Address', t.address || '')}</table>`;
}

export function buildEmail(type: 'booking_confirmed' | 'payment_failed' | 'booking_cancelled', ctx: Ctx, extra: any = {}) {
  const { booking: b, business } = ctx;
  if (type === 'booking_confirmed') {
    return {
      subject: `Booking confirmed · ${b.ref}`,
      html: wrap(business, 'Your booking is confirmed', `<p>Hi ${b.customer_name}, you're all set. Show the QR code from your booking page at the turf.</p>${details(ctx)}
<table style="width:100%;border-collapse:collapse">${row('Amount paid', inr(b.total))}${row('Payment ID', extra.txnId || '—')}${row('Status', 'CONFIRMED')}</table>`),
    };
  }
  if (type === 'payment_failed') {
    return {
      subject: 'Payment failed · your slot is still held for a few minutes',
      html: wrap(business, 'Payment was not completed', `<p>Hi ${b.customer_name}, your payment did not go through, so the booking is <strong>not confirmed</strong>.</p>${details(ctx)}
<p>Your slot stays reserved until the timer on the checkout page runs out. Open the checkout page and try again, or start a new booking.</p>`),
    };
  }
  return {
    subject: `Booking cancelled · ${b.ref}`,
    html: wrap(business, 'Your booking was cancelled', `<p>Hi ${b.customer_name}, the booking below has been cancelled.</p>${details(ctx)}
<table style="width:100%;border-collapse:collapse">${row('Reason', b.cancel_reason || '—')}${row('Refund', b.refund_amount > 0 ? inr(b.refund_amount) + ' (to original payment method in 5–7 working days)' : 'No refund applicable')}${row('Cancellation charge', inr(Math.max(0, b.total - (b.refund_amount || 0))))}</table>`),
  };
}

/** Stores the email in the outbox. With RESEND_API_KEY set it is also sent for real. */
export async function queueEmail(c: PoolClient, bookingId: string, type: string, to: string | null, subject: string, html: string) {
  const live = !!process.env.RESEND_API_KEY && !!to;
  await c.query('INSERT INTO email_log(booking_id,type,to_email,subject,body_html,status) VALUES ($1,$2,$3,$4,$5,$6)', [bookingId, type, to, subject, html, live ? 'queued' : 'preview']);
}

export async function flushQueuedEmails() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const rows = await q<any>("SELECT id,to_email,subject,body_html FROM email_log WHERE status='queued' ORDER BY created_at LIMIT 20");
  for (const r of rows) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'TurfBooking <onboarding@resend.dev>', to: [r.to_email], subject: r.subject, html: r.body_html }),
      });
      await q('UPDATE email_log SET status=$2 WHERE id=$1', [r.id, res.ok ? 'sent' : 'failed']);
    } catch {
      await q("UPDATE email_log SET status='failed' WHERE id=$1", [r.id]);
    }
  }
}
