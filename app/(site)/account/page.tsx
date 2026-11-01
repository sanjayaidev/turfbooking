import Link from 'next/link';
import { CalendarDays, Clock } from 'lucide-react';
import { q, expireStale } from '@/lib/db';
import { requireCustomer } from '@/lib/auth';
import { fmtDate, fmtDuration, fmtTime, inr } from '@/lib/time';
import { Empty, PayBadge, StatusBadge, cn } from '@/components/ui';
import { updateProfile } from './actions';

export const metadata = { title: 'My Account' };

export default async function Account({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireCustomer('/account');
  await expireStale();
  const tab = ['upcoming', 'past', 'cancelled', 'profile'].includes(searchParams.tab || '') ? searchParams.tab! : 'upcoming';
  const rows = await q<any>(
    `SELECT b.*, t.name AS turf_name, t.sport FROM bookings b JOIN turfs t ON t.id=b.turf_id
     WHERE b.user_id=$1 AND (b.status IN ('confirmed','cancelled') OR (b.status='reserved')) ORDER BY b.start_ts DESC`, [user.id]);
  const now = Date.now();
  const lists = {
    upcoming: rows.filter((b) => (b.status === 'confirmed' && new Date(b.end_ts).getTime() >= now) || b.status === 'reserved').reverse(),
    past: rows.filter((b) => b.status === 'confirmed' && new Date(b.end_ts).getTime() < now),
    cancelled: rows.filter((b) => b.status === 'cancelled'),
  };
  const tabs: [string, string, number | null][] = [['upcoming', 'Upcoming', lists.upcoming.length], ['past', 'Past', lists.past.length], ['cancelled', 'Cancelled', lists.cancelled.length], ['profile', 'Profile', null]];
  const list = (lists as any)[tab] as any[] | undefined;
  return (
    <div className="container-x max-w-4xl py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Hi, {user.name.split(' ')[0]} 👋</h1>
      <p className="mt-1 text-ink-500">Manage your bookings and profile.</p>
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {tabs.map(([k, l, n]) => (
          <Link key={k} href={`/account?tab=${k}`} className={cn('flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition', tab === k ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-50')}>{l}{n != null && <span className={cn('ml-1.5 rounded-full px-1.5 text-xs', tab === k ? 'bg-white/20' : 'bg-ink-100')}>{n}</span>}</Link>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'profile' ? (
          <form action={updateProfile} className="card max-w-lg space-y-4 p-6">
            <div><label className="label">Full name</label><input name="name" className="input" defaultValue={user.name} required /></div>
            <div><label className="label">Mobile number</label><input name="phone" className="input" defaultValue={user.phone || ''} required /></div>
            <div><label className="label">Email</label><input className="input bg-ink-50" value={user.email} disabled /></div>
            <button className="btn-primary">Save changes</button>
          </form>
        ) : list && list.length ? (
          <div className="space-y-3">
            {list.map((b) => (
              <Link key={b.id} href={b.status === 'reserved' ? `/checkout/${b.id}` : `/bookings/${b.id}`} className="card flex flex-col gap-3 p-5 transition hover:shadow-pop sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{b.turf_name}</p><StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} /></div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{fmtDate(b.start_ts)}</span><span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{fmtTime(b.start_ts)} · {fmtDuration(b.duration_min)}</span></p>
                  {b.ref && <p className="mt-1 font-mono text-xs text-ink-400">{b.ref}</p>}
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1"><p className="font-display text-lg font-extrabold">{inr(b.total)}</p><PayBadge status={b.payment_status} /></div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title={`No ${tab} bookings`} hint="When you book a turf it will show up here." action={<Link href="/turfs" className="btn-primary">Book a turf</Link>} />
        )}
      </div>
    </div>
  );
}
