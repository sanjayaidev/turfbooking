import Link from 'next/link';
import { Download, Plus, Search } from 'lucide-react';
import { q, expireStale } from '@/lib/db';
import { can, requirePerm } from '@/lib/auth';
import { searchBookings } from '@/lib/bookingQuery';
import { fmtDate, fmtDuration, fmtTime, inr } from '@/lib/time';
import { Empty, PageHeader, PayBadge, StatusBadge } from '@/components/ui';

export const metadata = { title: 'Bookings' };
const PAGE = 20;

export default async function Bookings({ searchParams: sp }: { searchParams: Record<string, string> }) {
  const user = await requirePerm('bookings.view');
  await expireStale();
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const [{ rows, total }, turfs] = await Promise.all([searchBookings(sp, PAGE, (page - 1) * PAGE), q<any>('SELECT id,name FROM turfs ORDER BY sort_order')]);
  const qs = (o: Record<string, any>) => { const p = new URLSearchParams({ ...sp, ...o } as any); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); return p.toString(); };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      <PageHeader title="Bookings" subtitle={`${total} booking${total === 1 ? '' : 's'} found`}
        actions={<>
          {can(user, 'export') && <a href={`/api/admin/export?${qs({ page: '' })}`} className="btn-outline"><Download className="h-4 w-4" />Export CSV</a>}
          {can(user, 'bookings.create') && <Link href="/admin/bookings/new" className="btn-primary"><Plus className="h-4 w-4" />New booking</Link>}
        </>} />

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input name="q" defaultValue={sp.q} className="input pl-10" placeholder="Search ref, name, phone, email" /></div>
        <select name="turf" defaultValue={sp.turf || ''} className="input"><option value="">All turfs</option>{turfs.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="date" name="date" defaultValue={sp.date} className="input" />
        <select name="status" defaultValue={sp.status || ''} className="input"><option value="">Any status</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="confirmed">Confirmed (all)</option><option value="reserved">Awaiting payment</option><option value="cancelled">Cancelled</option></select>
        <select name="pay" defaultValue={sp.pay || ''} className="input"><option value="">Any payment</option><option value="successful">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="partially_refunded">Partially refunded</option></select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6"><button className="btn-primary">Apply filters</button><Link href="/admin/bookings" className="btn-ghost">Reset</Link></div>
      </form>

      {rows.length === 0 ? <Empty title="No bookings match" hint="Try changing or resetting the filters." /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th">Reference</th><th className="th">Customer</th><th className="th">Turf</th><th className="th">When</th><th className="th">Amount</th><th className="th">Status</th><th className="th">Payment</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((b: any) => (
                  <tr key={b.id} className="hover:bg-ink-50/70">
                    <td className="td"><Link href={`/admin/bookings/${b.id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">{b.ref || 'Unconfirmed'}</Link>{b.source === 'admin' && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">MANUAL</span>}</td>
                    <td className="td"><p className="font-semibold">{b.customer_name}</p><p className="text-xs text-ink-500">{b.customer_phone}</p></td>
                    <td className="td text-ink-600">{b.turf_name}</td>
                    <td className="td"><p className="font-medium">{fmtDate(b.start_ts, { day: 'numeric', month: 'short', year: 'numeric' })}</p><p className="text-xs text-ink-500">{fmtTime(b.start_ts)} · {fmtDuration(b.duration_min)}</p></td>
                    <td className="td font-semibold">{inr(b.total)}</td>
                    <td className="td"><StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} /></td>
                    <td className="td"><PayBadge status={b.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm">
              <span className="text-ink-500">Page {page} of {pages}</span>
              <div className="flex gap-2">
                {page > 1 && <Link className="btn-outline btn-sm" href={`/admin/bookings?${qs({ page: page - 1 })}`}>Previous</Link>}
                {page < pages && <Link className="btn-outline btn-sm" href={`/admin/bookings?${qs({ page: page + 1 })}`}>Next</Link>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
