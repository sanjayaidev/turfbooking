import { q1 } from '@/lib/db';
import { normPhone } from '@/lib/auth';
import { fmtDate, fmtDuration, fmtTime, inr } from '@/lib/time';
import { PayBadge, StatusBadge } from '@/components/ui';
import { Search } from 'lucide-react';

export const metadata = { title: 'Find my booking' };

export default async function Track({ searchParams }: { searchParams: { ref?: string; phone?: string } }) {
  const ref = (searchParams.ref || '').trim().toUpperCase();
  const phone = normPhone(searchParams.phone || '');
  const searched = !!(ref || phone);
  const b = ref && phone.length === 10 ? await q1<any>(`SELECT b.*, t.name AS turf_name, t.address AS turf_address FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.ref=$1 AND right(regexp_replace(b.customer_phone,'\\D','','g'),10)=$2`, [ref, phone]) : null;
  return (
    <div className="container-x max-w-xl py-12">
      <h1 className="text-3xl font-extrabold">Find my booking</h1>
      <p className="mt-1 text-ink-500">Enter your booking reference and the mobile number used for the booking.</p>
      <form className="card mt-6 space-y-4 p-6">
        <div><label className="label">Booking reference</label><input name="ref" defaultValue={searchParams.ref} className="input font-mono uppercase" placeholder="SBL-CRT-20261101-0001" required /></div>
        <div><label className="label">Mobile number</label><input name="phone" defaultValue={searchParams.phone} className="input" inputMode="numeric" placeholder="10-digit mobile" required /></div>
        <button className="btn-primary w-full"><Search className="h-4 w-4" />Find booking</button>
      </form>
      {searched && (b ? (
        <div className="card mt-6 p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold">{b.ref}</p><p className="mt-1 text-lg font-bold">{b.turf_name}</p></div><StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} /></div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Date</dt><dd className="font-medium">{fmtDate(b.start_ts)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Time</dt><dd className="font-medium">{fmtTime(b.start_ts)} – {fmtTime(b.end_ts)} ({fmtDuration(b.duration_min)})</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Amount</dt><dd className="font-medium">{inr(b.total)} <PayBadge status={b.payment_status} /></dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-400">Sign in to your account to see the QR code and manage this booking.</p>
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No booking matches that reference and mobile number. Please check both and try again.</p>
      ))}
    </div>
  );
}
