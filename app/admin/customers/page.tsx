import Link from 'next/link';
import { Search } from 'lucide-react';
import { q } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { fmtDate, inr } from '@/lib/time';
import { Empty, PageHeader } from '@/components/ui';

export const metadata = { title: 'Customers' };

export default async function Customers({ searchParams }: { searchParams: { q?: string } }) {
  await requirePerm('customers.view');
  const term = `%${(searchParams.q || '').trim()}%`;
  const rows = await q<any>(`
    SELECT u.id,u.name,u.email,u.phone,u.created_at,
      count(b.id) FILTER (WHERE b.status='confirmed')::int AS bookings,
      coalesce(sum(b.total - b.refund_amount) FILTER (WHERE b.payment_status IN ('successful','partially_refunded')),0) AS spent,
      max(b.start_ts) FILTER (WHERE b.status='confirmed') AS last_booking
    FROM users u LEFT JOIN bookings b ON b.user_id=u.id
    WHERE u.role='customer' AND (u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)
    GROUP BY u.id ORDER BY spent DESC, u.created_at DESC LIMIT 200`, [term]);
  return (
    <>
      <PageHeader title="Customers" subtitle={`${rows.length} registered customer${rows.length === 1 ? '' : 's'}`} />
      <form className="card mb-5 flex gap-3 p-4"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input name="q" defaultValue={searchParams.q} className="input pl-10" placeholder="Search name, email or phone" /></div><button className="btn-primary">Search</button></form>
      {rows.length === 0 ? <Empty title="No customers found" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px]"><thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th">Customer</th><th className="th">Contact</th><th className="th">Bookings</th><th className="th">Total spent</th><th className="th">Last booking</th><th className="th">Joined</th></tr></thead>
          <tbody className="divide-y divide-ink-100">{rows.map((c: any) => (
            <tr key={c.id} className="hover:bg-ink-50/70"><td className="td"><Link href={`/admin/bookings?q=${encodeURIComponent(c.email)}`} className="font-semibold text-brand-700 hover:underline">{c.name}</Link></td><td className="td text-sm"><p>{c.phone}</p><p className="text-xs text-ink-500">{c.email}</p></td><td className="td font-semibold">{c.bookings}</td><td className="td font-semibold">{inr(c.spent)}</td><td className="td text-sm text-ink-600">{c.last_booking ? fmtDate(c.last_booking, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td><td className="td text-sm text-ink-500">{fmtDate(c.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
