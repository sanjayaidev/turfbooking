'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import SlotPicker, { Pick } from './SlotPicker';
import { fmtDuration, fmtMin, inr } from '@/lib/time';

export default function ManualBooking({ turfs, today }: { turfs: { id: string; name: string; durations: number[] }[]; today: string }) {
  const router = useRouter();
  const [turfId, setTurfId] = useState(turfs[0]?.id);
  const turf = turfs.find((t) => t.id === turfId)!;
  const [pick, setPick] = useState<Pick | null>(null);
  const [f, setF] = useState({ name: '', phone: '', email: '', payment: 'paid', method: 'Cash', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pick || pick.startMin == null) { setErr('Please select a slot first.'); return; }
    setBusy(true); setErr('');
    const r = await fetch('/api/admin/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, turfId, date: pick.date, startMin: pick.startMin, duration: pick.duration }) });
    const j = await r.json();
    if (j.ok) { router.push(`/admin/bookings/${j.id}?msg=${encodeURIComponent('Manual booking created')}`); router.refresh(); }
    else { setErr(j.error); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="card space-y-5 p-6">
        <div><label className="label">Turf</label><select className="input" value={turfId} onChange={(e) => { setTurfId(e.target.value); setPick(null); }}>{turfs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <SlotPicker key={turfId} turfId={turfId} durations={turf.durations} today={today} admin onChange={setPick} days={10} columns="grid-cols-3 sm:grid-cols-4" />
      </div>
      <div className="space-y-5">
        <div className="card space-y-4 p-6">
          <h2 className="font-bold">Customer</h2>
          <div><label className="label">Name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
          <div><label className="label">Mobile</label><input className="input" required inputMode="numeric" value={f.phone} onChange={set('phone')} /></div>
          <div><label className="label">Email (optional)</label><input className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div><label className="label">Notes (optional)</label><input className="input" value={f.notes} onChange={set('notes')} /></div>
        </div>
        <div className="card space-y-4 p-6">
          <h2 className="font-bold">Payment</h2>
          <div className="grid grid-cols-2 gap-2">
            {[['paid', 'Collected now'], ['pay_later', 'Pay at venue']].map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, payment: v })} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${f.payment === v ? 'border-brand-700 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-ink-200 text-ink-600'}`}>{l}</button>)}
          </div>
          {f.payment === 'paid' && <div><label className="label">Method</label><select className="input" value={f.method} onChange={set('method')}><option>Cash</option><option>UPI</option><option>Card</option></select></div>}
          <div className="rounded-xl bg-ink-50 p-4 text-sm">
            {pick?.startMin != null ? (<div className="flex items-end justify-between"><div><p className="text-ink-500">{pick.date} · {fmtDuration(pick.duration)}</p><p className="font-semibold">{fmtMin(pick.startMin)} – {fmtMin(pick.startMin + pick.duration)}</p></div><p className="font-display text-2xl font-extrabold text-brand-800">{inr(pick.price || 0)}</p></div>) : <p className="text-ink-400">Select a slot to see the price.</p>}
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create booking'}</button>
        </div>
      </div>
    </form>
  );
}
