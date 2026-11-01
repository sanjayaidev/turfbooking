import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { q, q1, expireStale } from '@/lib/db';
import { can, requirePerm } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtDuration, fmtTime, inr } from '@/lib/time';
import { PayBadge, StatusBadge } from '@/components/ui';
import { adminCancelBooking, adminCheckIn, adminMarkPaid, adminRecordRefund } from '../../actions';

export const metadata = { title: 'Booking' };

export default async function BookingDetail({ params }: { params: { id: string } }) {
  const user = await requirePerm('bookings.view');
  await expireStale();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const b = await q1<any>(`SELECT b.*, t.name AS turf_name, t.address AS turf_address, cb.name AS created_by_name, ci.name AS checked_in_by_name FROM bookings b JOIN turfs t ON t.id=b.turf_id LEFT JOIN users cb ON cb.id=b.created_by LEFT JOIN users ci ON ci.id=b.checked_in_by WHERE b.id=$1`, [params.id]);
  if (!b) notFound();
  const [pays, mails, logs] = await Promise.all([
    q<any>('SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at', [b.id]),
    q<any>('SELECT id,type,subject,status,created_at FROM email_log WHERE booking_id=$1 ORDER BY created_at', [b.id]),
    q<any>("SELECT * FROM audit_logs WHERE entity='booking' AND entity_id=$1 ORDER BY created_at DESC", [b.id]),
  ]);
  const paid = b.payment_status === 'successful' || b.payment_status === 'partially_refunded';
  const refundable = b.total - b.refund_amount;
  const Row = ({ k, v }: { k: string; v: any }) => <div className="flex justify-between gap-4 py-2.5 text-sm"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
  return (
    <>
      <Link href="/admin/bookings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" />All bookings</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Booking reference</p><h1 className="font-mono text-2xl font-bold">{b.ref || 'Awaiting payment'}</h1></div>
        <div className="flex items-center gap-2"><StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} /><PayBadge status={b.payment_status} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6"><h2 className="font-bold">Booking details</h2>
            <dl className="mt-2 divide-y divide-ink-100">
              <Row k="Turf" v={b.turf_name} /><Row k="Date" v={fmtDate(b.start_ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row k="Time" v={`${fmtTime(b.start_ts)} – ${fmtTime(b.end_ts)} (${fmtDuration(b.duration_min)})`} />
              <Row k="Source" v={b.source === 'admin' ? `Manual · ${b.created_by_name || 'admin'}` : 'Online'} />
              <Row k="Created" v={fmtDateTime(b.created_at)} />
              {b.checked_in_at && <Row k="Checked in" v={`${fmtDateTime(b.checked_in_at)}${b.checked_in_by_name ? ' by ' + b.checked_in_by_name : ''}`} />}
              {b.notes && <Row k="Notes" v={b.notes} />}
              {b.status === 'cancelled' && <Row k="Cancelled" v={`${b.cancelled_at ? fmtDateTime(b.cancelled_at) : ''} by ${b.cancelled_by || '—'}${b.cancel_reason ? ' · ' + b.cancel_reason : ''}`} />}
            </dl></div>
          <div className="card p-6"><h2 className="font-bold">Payments & refunds</h2>
            <dl className="mt-2 divide-y divide-ink-100"><Row k="Turf charges" v={inr(b.subtotal)} />{b.discount > 0 && <Row k={`Discount${b.coupon_code ? ' (' + b.coupon_code + ')' : ''}`} v={`− ${inr(b.discount)}`} />}<Row k="Total" v={<b>{inr(b.total)}</b>} />{b.refund_amount > 0 && <Row k="Refunded" v={inr(b.refund_amount)} />}</dl>
            {pays.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th px-0">Type</th><th className="th">Method</th><th className="th">Amount</th><th className="th">Status</th><th className="th">Transaction</th><th className="th">When</th></tr></thead><tbody className="divide-y divide-ink-100">{pays.map((p: any) => <tr key={p.id}><td className="py-2 capitalize">{p.kind}</td><td className="td">{p.method}</td><td className="td">{inr(p.amount)}</td><td className="td capitalize">{p.status}</td><td className="td font-mono text-xs">{p.txn_id}</td><td className="td text-xs text-ink-500">{fmtDateTime(p.created_at)}</td></tr>)}</tbody></table></div>}
          </div>
          <div className="card p-6"><h2 className="font-bold">Emails</h2>
            {mails.length ? <ul className="mt-3 divide-y divide-ink-100 text-sm">{mails.map((m: any) => <li key={m.id} className="flex justify-between gap-3 py-2.5"><span>{m.subject}</span><span className="shrink-0 text-xs capitalize text-ink-500">{m.status} · {fmtDateTime(m.created_at)}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-400">No emails yet.</p>}
            <Link href="/admin/emails" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">Open email outbox →</Link>
          </div>
          {logs.length > 0 && <div className="card p-6"><h2 className="font-bold">Activity</h2><ul className="mt-3 space-y-2 text-sm text-ink-600">{logs.map((l: any) => <li key={l.id}><b>{l.user_name}</b> · {l.action} <span className="text-xs text-ink-400">{fmtDateTime(l.created_at)}</span></li>)}</ul></div>}
        </div>

        <div className="space-y-6">
          <div className="card p-6"><h2 className="font-bold">Customer</h2>
            <p className="mt-3 font-semibold">{b.customer_name}</p><p className="text-sm text-ink-600">{b.customer_phone}</p><p className="text-sm text-ink-600">{b.customer_email || 'No email'}</p>
            <Link href={`/admin/bookings?q=${b.customer_phone}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">All bookings by this customer →</Link></div>

          {b.status === 'confirmed' && (
            <div className="card space-y-4 p-6"><h2 className="font-bold">Actions</h2>
              {can(user, 'checkin') && !b.checked_in_at && <form action={adminCheckIn}><input type="hidden" name="id" value={b.id} /><button className="btn-primary w-full">Mark checked in</button></form>}
              {can(user, 'bookings.create') && b.payment_status === 'pending' && (
                <form action={adminMarkPaid} className="space-y-2 rounded-xl bg-amber-50 p-3"><input type="hidden" name="id" value={b.id} /><p className="text-xs font-semibold text-amber-800">Payment pending (pay at venue)</p><select name="method" className="input"><option>Cash</option><option>UPI</option><option>Card</option></select><button className="btn-accent w-full">Record {inr(b.total)} received</button></form>
              )}
              {can(user, 'bookings.cancel') && (
                <form action={adminCancelBooking} className="space-y-3 border-t border-ink-100 pt-4"><input type="hidden" name="id" value={b.id} />
                  <p className="text-sm font-semibold text-red-700">Cancel booking</p>
                  <div><label className="label">Refund amount (₹)</label><input type="number" name="refund" min={0} max={b.total} defaultValue={0} className="input" disabled={!paid} /><p className="mt-1 text-xs text-ink-400">{paid ? `Up to ${inr(b.total)}. Enter 0 for no refund (cancellation charge).` : 'No payment received, nothing to refund.'}</p></div>
                  <div><label className="label">Reason</label><input name="reason" className="input" placeholder="e.g. Rain, customer request" /></div>
                  <button className="btn-danger w-full">Cancel & release slot</button></form>
              )}
            </div>
          )}
          {b.status === 'cancelled' && can(user, 'bookings.cancel') && refundable > 0 && paid && (
            <form action={adminRecordRefund} className="card space-y-3 p-6"><input type="hidden" name="id" value={b.id} /><h2 className="font-bold">Record refund</h2><p className="text-xs text-ink-500">Up to {inr(refundable)} still refundable.</p>
              <input type="number" name="amount" min={1} max={refundable} className="input" placeholder="Amount ₹" required /><input name="note" className="input" placeholder="Note (optional)" /><button className="btn-primary w-full">Record refund</button></form>
          )}
        </div>
      </div>
    </>
  );
}
