'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import SlotPicker, { Pick } from './SlotPicker';
import { fmtDuration, fmtMin, inr } from '@/lib/time';

export default function BookingWidget({ turf, today, initial, loggedIn }: {
  turf: { id: string; slug: string; durations: number[]; promo_percent: number; promo_label: string | null };
  today: string; initial?: { date?: string; duration?: number; start?: number }; loggedIn: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    if (!pick || pick.startMin == null) return;
    if (!loggedIn) {
      const next = `/turfs/${turf.slug}?date=${pick.date}&duration=${pick.duration}&start=${pick.startMin}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true); setErr('');
    const r = await fetch('/api/bookings/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turfId: turf.id, date: pick.date, startMin: pick.startMin, duration: pick.duration }) });
    const j = await r.json();
    if (j.ok) router.push(`/checkout/${j.id}`);
    else { setErr(j.error || 'Could not reserve this slot.'); setBusy(false); if (j.code === 'slot_taken') router.refresh(); }
  }

  const ready = pick && pick.startMin != null;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-100 bg-brand-950 px-5 py-4 text-white">
        <p className="font-display text-lg font-bold">Book this turf</p>
        <p className="text-xs text-brand-200">Pick a date, duration and start time</p>
      </div>
      <div className="p-5">
        {turf.promo_percent > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-accent-300/40 px-3 py-2 text-xs font-semibold text-brand-900"><Sparkles className="h-4 w-4" />{turf.promo_label || `${turf.promo_percent}% off`} — already included in the prices below</div>
        )}
        <SlotPicker turfId={turf.id} durations={turf.durations} today={today} initial={initial} onChange={setPick} />
        <div className="mt-5 border-t border-ink-100 pt-4">
          {ready ? (
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-xs text-ink-500">{new Date(pick!.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · {fmtDuration(pick!.duration)}</p>
                <p className="font-semibold text-ink-800">{fmtMin(pick!.startMin!)} – {fmtMin(pick!.startMin! + pick!.duration)}</p>
              </div>
              <p className="font-display text-2xl font-extrabold text-brand-800">{inr(pick!.price || 0)}</p>
            </div>
          ) : <p className="mb-3 text-sm text-ink-400">Select a green slot to see the price.</p>}
          {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary btn-lg w-full" disabled={!ready || busy} onClick={go}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{loggedIn ? 'Continue to checkout' : 'Sign in to continue'}<ArrowRight className="h-5 w-5" /></>}
          </button>
          <p className="mt-2 text-center text-xs text-ink-400">Your slot is held for 10 minutes at checkout.</p>
        </div>
      </div>
    </div>
  );
}
