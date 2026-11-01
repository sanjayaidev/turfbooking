import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { q, expireStale } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { addDays, dowOf, fmtDate, fmtMin, fmtTime, isDateStr, istDate, minuteOfDay, tsOf } from '@/lib/time';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Calendar' };
const PX = 1.1; // pixels per minute

export default async function CalendarPage({ searchParams }: { searchParams: { date?: string } }) {
  await requirePerm('bookings.view');
  await expireStale();
  const today = istDate();
  const date = isDateStr(searchParams.date) ? searchParams.date! : today;
  const [turfs, hours, bookings, blocks] = await Promise.all([
    q<any>("SELECT id,name FROM turfs WHERE status='active' ORDER BY sort_order"),
    q<any>('SELECT * FROM operating_hours WHERE dow=$1', [dowOf(date)]),
    q<any>("SELECT * FROM bookings WHERE status IN ('reserved','confirmed') AND start_ts < $2 AND end_ts > $1", [tsOf(date, 0), tsOf(date, 1440)]),
    q<any>('SELECT * FROM blocks WHERE start_ts < $2 AND end_ts > $1', [tsOf(date, 0), tsOf(date, 1440)]),
  ]);
  const open = hours.filter((h: any) => !h.is_closed);
  const from = Math.floor(Math.min(360, ...open.map((h: any) => h.open_min)) / 60) * 60;
  const to = Math.min(1440, Math.ceil(Math.max(1380, ...open.map((h: any) => h.close_min)) / 60) * 60);
  const rows = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const clamp = (d: Date) => Math.min(to, Math.max(from, d.getTime() <= tsOf(date, 0).getTime() ? 0 : d.getTime() >= tsOf(date, 1440).getTime() ? 1440 : minuteOfDay(d)));
  const H = (to - from) * PX;
  return (
    <>
      <PageHeader title="Calendar" subtitle={fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<><Link href={`/admin/calendar?date=${addDays(date, -1)}`} className="btn-outline btn-sm"><ChevronLeft className="h-4 w-4" /></Link><Link href="/admin/calendar" className="btn-outline btn-sm">Today</Link><Link href={`/admin/calendar?date=${addDays(date, 1)}`} className="btn-outline btn-sm"><ChevronRight className="h-4 w-4" /></Link>
          <form className="flex"><input type="date" name="date" defaultValue={date} className="input !w-auto !py-1.5 text-xs" /><button className="btn-primary btn-sm ml-2">Go</button></form></>} />
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-ink-500">
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-emerald-500" />Confirmed</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-400" />On hold</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-ink-400" />Blocked / maintenance</span>
      </div>
      <div className="card overflow-x-auto">
        <div className="flex min-w-[640px]">
          <div className="w-16 shrink-0 border-r border-ink-100">
            <div className="h-11 border-b border-ink-100" />
            <div className="relative" style={{ height: H }}>{rows.map((m) => <span key={m} className="absolute right-2 -translate-y-2 text-[11px] font-medium text-ink-400" style={{ top: (m - from) * PX }}>{fmtMin(m).replace(':00', '')}</span>)}</div>
          </div>
          {turfs.map((t: any) => {
            const hrs = hours.find((h: any) => h.turf_id === t.id);
            return (
              <div key={t.id} className="min-w-[200px] flex-1 border-r border-ink-100 last:border-r-0">
                <div className="flex h-11 items-center justify-center border-b border-ink-100 bg-ink-50 px-2 text-center text-sm font-bold">{t.name}</div>
                <div className="relative" style={{ height: H }}>
                  {rows.map((m) => <div key={m} className="absolute inset-x-0 border-t border-ink-100" style={{ top: (m - from) * PX }} />)}
                  {(!hrs || hrs.is_closed) ? <div className="absolute inset-0 grid place-items-center bg-ink-100/60 text-sm font-semibold text-ink-400">Closed</div> : (<>
                    <div className="absolute inset-x-0 top-0 bg-ink-100/70" style={{ height: Math.max(0, hrs.open_min - from) * PX }} />
                    <div className="absolute inset-x-0 bg-ink-100/70" style={{ top: (hrs.close_min - from) * PX, height: Math.max(0, to - hrs.close_min) * PX }} />
                  </>)}
                  {blocks.filter((b: any) => b.turf_id === t.id).map((b: any) => { const s = clamp(b.start_ts), e = clamp(b.end_ts); return (
                    <div key={b.id} className="absolute inset-x-1 overflow-hidden rounded-lg bg-ink-400/90 px-2 py-1 text-[11px] font-semibold text-white" style={{ top: (s - from) * PX, height: Math.max(18, (e - s) * PX) - 2 }}>{b.kind === 'maintenance' ? 'Maintenance' : 'Blocked'}{b.reason ? ` · ${b.reason}` : ''}</div>); })}
                  {bookings.filter((b: any) => b.turf_id === t.id).map((b: any) => { const s = clamp(b.start_ts), e = clamp(b.end_ts); const held = b.status === 'reserved'; return (
                    <Link key={b.id} href={`/admin/bookings/${b.id}`} className={`absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight shadow-sm transition hover:brightness-95 ${held ? 'bg-amber-300 text-amber-950' : b.checked_in_at ? 'bg-violet-500 text-white' : 'bg-emerald-500 text-white'}`} style={{ top: (s - from) * PX, height: Math.max(22, (e - s) * PX) - 2 }}>
                      <b className="block truncate">{b.customer_name}</b><span className="opacity-90">{fmtTime(b.start_ts)} – {fmtTime(b.end_ts)}{held ? ' · on hold' : ''}</span></Link>); })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
