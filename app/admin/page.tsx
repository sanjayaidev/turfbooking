import Link from 'next/link';
import { CalendarCheck, CalendarClock, CalendarX2, IndianRupee, CheckCircle2, XCircle, Hourglass, TrendingUp, Sun, Ticket } from 'lucide-react';
import { q, q1, expireStale } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { addDays, fmtMin, fmtTime, inr, istDate, tsOf, fmtDate } from '@/lib/time';
import { BarChart, HBar, Stat } from '@/components/Charts';
import { PageHeader, StatusBadge, Empty } from '@/components/ui';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }: { searchParams: { turf?: string } }) {
  await requirePerm('dashboard');
  await expireStale();
  const turfId = /^[0-9a-f-]{36}$/i.test(searchParams.turf || '') ? searchParams.turf! : null;
  const turfs = await q<any>('SELECT id,name FROM turfs ORDER BY sort_order, name');
  const today = istDate();
  const monthStart = today.slice(0, 7) + '-01';
  const from14 = addDays(today, -13);
  const dayStart = tsOf(today, 0), dayEnd = tsOf(today, 1440);

  const [s, daily, popular, todays, byTurf] = await Promise.all([
    q1<any>(`
      SELECT
        count(*) FILTER (WHERE status='confirmed')::int AS total,
        count(*) FILTER (WHERE status='confirmed' AND start_ts >= $2 AND start_ts < $3)::int AS today,
        count(*) FILTER (WHERE status='confirmed' AND end_ts > now())::int AS upcoming,
        count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
        count(*) FILTER (WHERE status IN ('confirmed','reserved') AND payment_status='pending')::int AS pending,
        coalesce(sum(total) FILTER (WHERE status IN ('confirmed','reserved') AND payment_status='pending'),0) AS pending_amt
      FROM bookings WHERE ($1::uuid IS NULL OR turf_id=$1)`, [turfId, dayStart, dayEnd]),
    q<any>(`SELECT (p.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
              sum(CASE WHEN p.kind='payment' AND p.status='successful' THEN p.amount WHEN p.kind='refund' AND p.status='successful' THEN -p.amount ELSE 0 END) AS amt,
              count(*) FILTER (WHERE p.kind='payment' AND p.status='successful')::int AS ok,
              count(*) FILTER (WHERE p.kind='payment' AND p.status='failed')::int AS bad
            FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE ($1::uuid IS NULL OR b.turf_id=$1) GROUP BY 1`, [turfId]),
    q<any>(`SELECT extract(hour from start_ts AT TIME ZONE 'Asia/Kolkata')::int AS h, count(*)::int AS n FROM bookings WHERE status='confirmed' AND ($1::uuid IS NULL OR turf_id=$1) GROUP BY 1 ORDER BY n DESC LIMIT 6`, [turfId]),
    q<any>(`SELECT b.*, t.name AS turf_name FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.status IN ('confirmed','reserved') AND b.start_ts >= $2 AND b.start_ts < $3 AND ($1::uuid IS NULL OR b.turf_id=$1) ORDER BY b.start_ts`, [turfId, dayStart, dayEnd]),
    q<any>(`SELECT t.name, count(b.id)::int AS n, coalesce(sum(b.total) FILTER (WHERE b.payment_status IN ('successful','partially_refunded')),0) AS rev FROM turfs t LEFT JOIN bookings b ON b.turf_id=t.id AND b.status='confirmed' GROUP BY t.id, t.name, t.sort_order ORDER BY t.sort_order`),
  ]);
  const rev = (pred: (d: string) => boolean) => daily.filter((r: any) => pred(r.d)).reduce((a: number, r: any) => a + r.amt, 0);
  const totalRev = rev(() => true), todayRev = rev((d) => d === today), monthRev = rev((d) => d >= monthStart);
  const okCount = daily.reduce((a: number, r: any) => a + r.ok, 0), badCount = daily.reduce((a: number, r: any) => a + r.bad, 0);
  const chart = Array.from({ length: 14 }, (_, i) => { const d = addDays(from14, i); const r = daily.find((x: any) => x.d === d); return { label: String(+d.slice(8)), value: Math.max(0, r?.amt || 0), sub: fmtDate(d, { day: 'numeric', month: 'short' }) }; });
  const hourLabel = (h: number) => `${fmtMin(h * 60)} – ${fmtMin(h * 60 + 60)}`;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Business overview · ${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <form className="flex gap-2">
            <select name="turf" defaultValue={turfId || ''} className="input !w-auto !py-2"><option value="">All turfs</option>{turfs.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <button className="btn-outline">Filter</button>
          </form>
        } />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total bookings" value={s.total} hint="Confirmed, all time" icon={<CalendarCheck className="h-5 w-5" />} />
        <Stat label="Today's bookings" value={s.today} hint="Starting today" icon={<Sun className="h-5 w-5" />} tone="amber" />
        <Stat label="Upcoming" value={s.upcoming} hint="Yet to be played" icon={<CalendarClock className="h-5 w-5" />} tone="green" />
        <Stat label="Cancelled" value={s.cancelled} icon={<CalendarX2 className="h-5 w-5" />} tone="red" />
        <Stat label="Total revenue" value={inr(totalRev)} hint="Net of refunds" icon={<IndianRupee className="h-5 w-5" />} />
        <Stat label="Today's revenue" value={inr(todayRev)} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <Stat label="This month" value={inr(monthRev)} hint="Month to date" icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <Stat label="Pending payments" value={s.pending} hint={`${inr(s.pending_amt)} to collect`} icon={<Hourglass className="h-5 w-5" />} tone="amber" />
        <Stat label="Successful payments" value={okCount} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <Stat label="Failed payments" value={badCount} icon={<XCircle className="h-5 w-5" />} tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card p-6 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Daily revenue</h2><p className="text-xs text-ink-400">Last 14 days · net of refunds</p></div><p className="font-display text-xl font-extrabold text-brand-800">{inr(chart.reduce((a, c) => a + c.value, 0))}</p></div>
          <BarChart data={chart} />
        </div>
        <div className="card p-6">
          <h2 className="font-bold">Popular start times</h2><p className="mb-5 text-xs text-ink-400">By number of bookings</p>
          {popular.length ? <HBar rows={popular.map((p: any) => ({ label: hourLabel(p.h), value: p.n, display: `${p.n} bookings` }))} /> : <p className="text-sm text-ink-400">No data yet.</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4"><h2 className="font-bold">Today&apos;s schedule</h2><Link href="/admin/calendar" className="text-sm font-semibold text-brand-700 hover:underline">Open calendar →</Link></div>
          {todays.length ? (
            <ul className="divide-y divide-ink-100">
              {todays.map((b: any) => (
                <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-ink-50">
                  <div className="w-24 shrink-0 text-sm font-bold text-brand-800">{fmtTime(b.start_ts)}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{b.customer_name}</p><p className="truncate text-xs text-ink-500">{b.turf_name} · {b.duration_min} min</p></div>
                  <StatusBadge status={b.status} end={b.end_ts} checkedIn={!!b.checked_in_at} />
                </Link></li>
              ))}
            </ul>
          ) : <div className="p-6"><Empty title="Nothing scheduled today" hint="Bookings for today will appear here." /></div>}
        </div>
        <div className="card p-6">
          <h2 className="font-bold">Turf performance</h2><p className="mb-5 text-xs text-ink-400">Confirmed bookings</p>
          <HBar rows={byTurf.map((t: any) => ({ label: t.name, value: t.n, display: `${t.n} · ${inr(t.rev)}` }))} color="bg-accent-500" />
        </div>
      </div>
    </>
  );
}
