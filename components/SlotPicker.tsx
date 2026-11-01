'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, Loader2 } from 'lucide-react';
import { addDays, fmtDuration, fmtMin } from '@/lib/time';
import { cn } from './ui';

export type Pick = { date: string; duration: number; startMin: number | null; price: number | null };
type Slot = { startMin: number; endMin: number; status: 'available' | 'booked' | 'held' | 'blocked' | 'past'; price: number | null };

const GROUPS: [string, number, number][] = [['Morning', 0, 720], ['Afternoon', 720, 960], ['Evening', 960, 1200], ['Night', 1200, 1440]];

function dayParts(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return {
    wd: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    dd: d.getUTCDate(),
    mon: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
  };
}

export default function SlotPicker({
  turfId, durations, today, admin = false, initial, onChange, days = 14, columns = 'grid-cols-3',
}: {
  turfId: string; durations: number[]; today: string; admin?: boolean;
  initial?: { date?: string; duration?: number; start?: number };
  onChange?: (p: Pick) => void; days?: number; columns?: string;
}) {
  const [date, setDate] = useState(initial?.date && initial.date >= today ? initial.date : today);
  const [duration, setDuration] = useState(initial?.duration && durations.includes(initial.duration) ? initial.duration : durations.includes(60) ? 60 : durations[0]);
  const [start, setStart] = useState<number | null>(initial?.start ?? null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [meta, setMeta] = useState<{ closed: boolean; open: number; close: number }>({ closed: false, open: 0, close: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const first = useRef(true);

  const strip = useMemo(() => {
    const base = Array.from({ length: days }, (_, i) => addDays(today, i));
    return base.includes(date) ? base : [...base, date].sort();
  }, [today, days, date]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/slots?turfId=${turfId}&date=${date}&duration=${duration}${admin ? '&admin=1' : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setSlots(j.slots); setMeta({ closed: j.closed, open: j.open, close: j.close }); setErr('');
      setStart((s) => (s != null && j.slots.some((x: Slot) => x.startMin === s && x.status === 'available') ? s : null));
    } catch (e: any) { setErr(e.message || 'Could not load slots'); setSlots([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); const id = setInterval(() => load(true), 15000); return () => clearInterval(id); }, [turfId, date, duration]); // eslint-disable-line

  useEffect(() => {
    const s = slots.find((x) => x.startMin === start);
    onChange?.({ date, duration, startMin: start, price: s?.price ?? null });
    first.current = false;
  }, [date, duration, start, slots]); // eslint-disable-line

  const counts = slots.reduce((a, s) => ({ ...a, [s.status]: (a as any)[s.status] + 1 }), { available: 0, booked: 0, held: 0, blocked: 0, past: 0 } as Record<string, number>);

  return (
    <div className="space-y-5">
      <div>
        <p className="label flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Date</p>
        <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {strip.map((d) => {
            const p = dayParts(d); const sel = d === date;
            return (
              <button key={d} type="button" onClick={() => setDate(d)}
                className={cn('flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition', sel ? 'border-brand-700 bg-brand-700 text-white shadow-sm' : 'border-ink-200 bg-white hover:border-brand-300')}>
                <span className={cn('text-[11px] font-medium', sel ? 'text-brand-100' : 'text-ink-500')}>{p.wd}</span>
                <span className="text-lg font-bold leading-tight">{p.dd}</span>
                <span className={cn('text-[11px]', sel ? 'text-brand-100' : 'text-ink-400')}>{p.mon}</span>
              </button>
            );
          })}
        </div>
        <input type="date" className="input mt-1 !py-2 text-xs" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick another date" />
      </div>

      <div>
        <p className="label flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Duration</p>
        <div className="flex flex-wrap gap-2">
          {durations.map((d) => (
            <button key={d} type="button" onClick={() => setDuration(d)}
              className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition', d === duration ? 'border-brand-700 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300')}>
              {fmtDuration(d)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="label !mb-0">Start time</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-ink-500">
            <Legend c="bg-emerald-500" t="Available" /><Legend c="bg-red-500" t="Booked" /><Legend c="bg-amber-400" t="On hold" /><Legend c="bg-ink-300" t="Unavailable" />
          </div>
        </div>
        {loading && !slots.length ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-ink-50 py-10 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" />Checking availability…</div>
        ) : err ? (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : meta.closed ? (
          <div className="rounded-xl bg-ink-50 p-6 text-center text-sm text-ink-500">Closed on this day. Please choose another date.</div>
        ) : !slots.length ? (
          <div className="rounded-xl bg-ink-50 p-6 text-center text-sm text-ink-500">No slots fit this duration. Try a shorter one.</div>
        ) : (
          <div className="space-y-4">
            {GROUPS.map(([name, a, b]) => {
              const list = slots.filter((s) => s.startMin >= a && s.startMin < b);
              if (!list.length) return null;
              return (
                <div key={name}>
                  <p className="mb-1.5 text-xs font-semibold text-ink-400">{name}</p>
                  <div className={cn('grid gap-2', columns)}>
                    {list.map((s) => <SlotButton key={s.startMin} s={s} sel={s.startMin === start} onClick={() => setStart(s.startMin)} />)}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-ink-400">{counts.available} of {slots.length} start times available · open {fmtMin(meta.open)} – {fmtMin(meta.close)} IST</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="inline-flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-full', c)} />{t}</span>;
}

function SlotButton({ s, sel, onClick }: { s: Slot; sel: boolean; onClick: () => void }) {
  const base = 'rounded-xl border px-2 py-2 text-center transition leading-tight';
  const style = {
    available: sel ? 'border-brand-700 bg-brand-700 text-white shadow-sm ring-2 ring-brand-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-100',
    booked: 'border-red-200 bg-red-50 text-red-400 cursor-not-allowed',
    held: 'border-amber-200 bg-amber-50 text-amber-600 cursor-not-allowed',
    blocked: 'border-ink-200 bg-ink-100 text-ink-400 cursor-not-allowed',
    past: 'border-ink-200 bg-ink-100 text-ink-300 cursor-not-allowed',
  }[s.status];
  const label = { available: s.price != null ? `₹${s.price.toLocaleString('en-IN')}` : '', booked: 'Booked', held: 'On hold', blocked: 'Blocked', past: '—' }[s.status];
  return (
    <button type="button" disabled={s.status !== 'available'} onClick={onClick} className={cn(base, style)} aria-pressed={sel}
      title={`${fmtMin(s.startMin)} – ${fmtMin(s.endMin)}`}>
      <span className="block text-[13px] font-bold">{fmtMin(s.startMin)}</span>
      <span className={cn('block text-[11px]', sel ? 'text-brand-100' : 'opacity-80')}>{label}</span>
    </button>
  );
}
