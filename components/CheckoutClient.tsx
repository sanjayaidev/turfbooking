'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Timer, Tag, ShieldCheck, Smartphone, CreditCard, Landmark, X } from 'lucide-react';
import { inr } from '@/lib/time';
import { cn } from './ui';

const METHODS = [['UPI', Smartphone], ['Card', CreditCard], ['Net Banking', Landmark]] as const;

export default function CheckoutClient({ id, expiresAt, subtotal, discount, total, coupon, promoLabel }: {
  id: string; expiresAt: string; subtotal: number; discount: number; total: number; coupon: string | null; promoLabel: string | null;
}) {
  const router = useRouter();
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  const [code, setCode] = useState('');
  const [price, setPrice] = useState({ discount, total, coupon });
  const [method, setMethod] = useState('UPI');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  const expired = left <= 0;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0'), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  async function post(path: string, body: any) {
    const r = await fetch(`/api/bookings/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }
  async function applyCoupon(c: string | null) {
    setBusy('coupon'); setMsg(null);
    const j = await post('coupon', { code: c });
    if (j.ok) { setPrice({ discount: j.discount, total: j.total, coupon: j.coupon }); setMsg({ t: 'ok', m: j.coupon ? `Coupon ${j.coupon} applied` : 'Coupon removed' }); if (!c) setCode(''); }
    else setMsg({ t: 'err', m: j.error });
    setBusy('');
  }
  async function pay(outcome: 'success' | 'fail') {
    setBusy(outcome); setMsg(null);
    const j = await post('pay', { outcome, method });
    if (j.ok && j.status === 'confirmed') { router.push(`/bookings/${id}?new=1`); router.refresh(); return; }
    if (j.ok && j.status === 'failed') setMsg({ t: 'err', m: 'Payment failed. Your booking is NOT confirmed. You can retry before the timer ends.' });
    else setMsg({ t: 'err', m: j.error || 'Something went wrong.' });
    setBusy('');
  }
  async function leave() { await post('release', {}); router.push('/turfs'); }

  return (
    <div className="space-y-5">
      <div className={cn('flex items-center justify-between rounded-2xl px-5 py-4', expired ? 'bg-red-50 text-red-700' : left < 120000 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-900')}>
        <div className="flex items-center gap-3"><Timer className="h-5 w-5" /><div><p className="text-sm font-semibold">{expired ? 'Reservation expired' : 'Slot held for you'}</p><p className="text-xs opacity-80">{expired ? 'The slot was released. Please start again.' : 'Complete payment before the timer ends'}</p></div></div>
        <p className="font-display text-3xl font-extrabold tabular-nums">{mm}:{ss}</p>
      </div>

      {expired ? (
        <button className="btn-primary btn-lg w-full" onClick={() => router.push('/turfs')}>Start a new booking</button>
      ) : (
        <>
          <div className="card p-5">
            <p className="label flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />Coupon code</p>
            {price.coupon ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">{price.coupon} applied <button onClick={() => applyCoupon(null)} aria-label="Remove coupon"><X className="h-4 w-4" /></button></div>
            ) : (
              <div className="flex gap-2"><input className="input uppercase" placeholder="e.g. WELCOME10" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn-outline" disabled={!code || busy === 'coupon'} onClick={() => applyCoupon(code)}>{busy === 'coupon' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}</button></div>
            )}
          </div>

          <div className="card p-5">
            <p className="label">Payment method</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(([m, Icon]) => (
                <button key={m} onClick={() => setMethod(m)} className={cn('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold transition', method === m ? 'border-brand-700 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-ink-200 text-ink-600 hover:border-brand-300')}><Icon className="h-5 w-5" />{m}</button>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between text-ink-600"><span>Turf charges</span><span>{inr(subtotal)}</span></div>
              {price.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discounts {promoLabel ? `(${promoLabel})` : ''}</span><span>− {inr(price.discount)}</span></div>}
              <div className="flex justify-between pt-2 text-lg font-extrabold text-ink-900"><span>Total payable</span><span>{inr(price.total)}</span></div>
            </div>
          </div>

          {msg && <p className={cn('rounded-xl px-4 py-3 text-sm font-medium', msg.t === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{msg.m}</p>}

          <button className="btn-primary btn-lg w-full" disabled={!!busy} onClick={() => pay('success')}>{busy === 'success' ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ShieldCheck className="h-5 w-5" />Pay {inr(price.total)}</>}</button>
          <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-4 text-center text-xs text-ink-500">
            <p className="font-semibold text-ink-600">Demo mode: no real payment is taken</p>
            <button className="mt-2 font-semibold text-red-600 hover:underline" disabled={!!busy} onClick={() => pay('fail')}>{busy === 'fail' ? 'Simulating…' : 'Simulate a failed payment'}</button>
            <span className="mx-2">·</span>
            <button className="font-semibold text-ink-600 hover:underline" onClick={leave}>Release slot & go back</button>
          </div>
        </>
      )}
    </div>
  );
}
