import { redirect } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { q, q1, expireStale } from '@/lib/db';
import { requireCustomer } from '@/lib/auth';
import { getSettings, refundPercentFor } from '@/lib/settings';
import { fmtDateTime, inr } from '@/lib/time';
import BookingSummary from '@/components/BookingSummary';
import CancelButton from '@/components/CancelButton';
import { PayBadge, StatusBadge } from '@/components/ui';
import PrintButton from '@/components/PrintButton';

export const metadata = { title: 'Booking' };

export default async function BookingPage({ params, searchParams }: { params: { id: string }; searchParams: { new?: string } }) {
  const user = await requireCustomer(`/bookings/${params.id}`);
  await expireStale();
  const b = await q1<any>(`SELECT b.*, t.name AS turf_name, t.sport AS turf_sport, t.address AS turf_address, t.phone AS turf_phone FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.id=$1 AND b.user_id=$2`, [params.id, user.id]).catch(() => null);
  if (!b) redirect('/account');
  if (b.status === 'reserved') redirect(`/checkout/${b.id}`);
  const [pays, s] = await Promise.all([q<any>('SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at', [b.id]), getSettings()]);
  const base = process.env.APP_URL || 'http://localhost:3000';
  const qr = b.checkin_token && b.status === 'confirmed' ? await QRCode.toDataURL(`${base}/admin/checkin?token=${b.checkin_token}`, { margin: 1, width: 280, color: { dark: '#0d3f2e' } }) : null;
  const future = new Date(b.start_ts).getTime() > Date.now();
  const canCancel = b.status === 'confirmed' && future && s.cancellation.enabled;
  const hours = (new Date(b.start_ts).getTime() - Date.now()) / 3600000;
  const pct = refundPercentFor(s.cancellation, hours);
  const refundText = b.payment_status === 'successful' ? `You will receive a refund of ${inr((b.total * pct) / 100)} (${pct}% of ${inr(b.total)}) as per the cancellation policy.` : 'No payment was taken for this booking.';

  return (
    <div className="container-x max-w-5xl py-10">
      {searchParams.new && b.status === 'confirmed' && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-brand-700 p-6 text-white">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-accent-400" />
          <div><p className="font-display text-xl font-bold">Booking confirmed!</p><p className="text-sm text-brand-100">A confirmation email is on its way. Show the QR code at the turf.</p></div>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Booking reference</p>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{b.ref || 'Not confirmed'}</h1>
        </div>
        <div className="flex items-center gap-2"><StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} /><PayBadge status={b.payment_status} /></div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <BookingSummary b={b} />
          <div className="card p-5">
            <h2 className="font-bold">Payment receipt</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Turf charges</dt><dd>{inr(b.subtotal)}</dd></div>
              {b.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {b.coupon_code ? `(${b.coupon_code})` : ''}</dt><dd>− {inr(b.discount)}</dd></div>}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold"><dt>Total</dt><dd>{inr(b.total)}</dd></div>
              {b.refund_amount > 0 && <div className="flex justify-between text-sky-700"><dt>Refunded</dt><dd>{inr(b.refund_amount)}</dd></div>}
            </dl>
            {pays.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-3 text-xs text-ink-500">
                {pays.map((p: any) => <p key={p.id}>{p.kind === 'refund' ? 'Refund' : 'Payment'} · {p.method} · {p.status} · <span className="font-mono">{p.txn_id}</span> · {fmtDateTime(p.created_at)}</p>)}
              </div>
            )}
          </div>
          {b.status === 'cancelled' && <div className="flex gap-3 rounded-2xl bg-red-50 p-5 text-sm text-red-800"><XCircle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">This booking was cancelled</p><p>{b.cancel_reason || ''} {b.refund_amount > 0 ? `Refund of ${inr(b.refund_amount)} recorded.` : ''}</p></div></div>}
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            {canCancel && <CancelButton id={b.id} refundText={refundText} />}
            {!canCancel && b.status === 'confirmed' && future && <p className="self-center text-xs text-ink-500">To cancel or change this booking, call {b.turf_phone || s.business.phone}.</p>}
          </div>
        </div>
        <aside>
          <div className="card sticky top-24 p-6 text-center">
            {qr ? (<>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Check-in QR code" className="mx-auto h-56 w-56" />
              <p className="mt-3 font-semibold">Check-in QR</p>
              <p className="mt-1 text-xs text-ink-500">Show this at the turf. It contains a secure token only, no personal details.</p>
            </>) : <p className="py-8 text-sm text-ink-500">No active QR code for this booking.</p>}
          </div>
        </aside>
      </div>
      <p className="mt-8 text-center text-sm"><Link href="/account" className="font-semibold text-brand-700 hover:underline">← Back to my bookings</Link></p>
    </div>
  );
}
