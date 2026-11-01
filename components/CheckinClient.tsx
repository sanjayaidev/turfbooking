'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, Loader2, Camera } from 'lucide-react';
import { fmtDate, fmtDuration, fmtTime, inr } from '@/lib/time';
import { PayBadge } from './ui';

export default function CheckinClient({ initialToken }: { initialToken?: string }) {
  const [token, setToken] = useState(initialToken || '');
  const [state, setState] = useState<{ kind: 'idle' | 'loading' | 'found' | 'error' | 'done'; booking?: any; msg?: string; result?: string }>({ kind: 'idle' });
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  function extract(v: string) { const m = v.match(/token=([\w-]+)/); return (m ? m[1] : v).trim(); }
  async function lookup(raw: string) {
    const t = extract(raw); if (!t) return;
    setToken(t); setState({ kind: 'loading' });
    const r = await fetch(`/api/admin/checkin?token=${encodeURIComponent(t)}`); const j = await r.json();
    setState(j.ok ? { kind: 'found', booking: j.booking } : { kind: 'error', msg: j.error });
  }
  async function confirm() {
    setState((s) => ({ ...s, kind: 'loading' }));
    const r = await fetch('/api/admin/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); const j = await r.json();
    if (j.ok) setState({ kind: 'done', result: j.result, booking: j.booking }); else setState({ kind: 'error', msg: j.error });
  }
  useEffect(() => { if (initialToken) lookup(initialToken); return stop; }, []); // eslint-disable-line

  function stop() { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setScanning(false); }
  async function scan() {
    const Det = (window as any).BarcodeDetector;
    if (!Det) { setState({ kind: 'error', msg: 'Camera scanning is not supported in this browser. Use your phone camera app to scan the QR, or paste the code below.' }); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
      const det = new Det({ formats: ['qr_code'] });
      const tick = async () => {
        if (!stream.current || !video.current) return;
        try { const codes = await det.detect(video.current); if (codes[0]?.rawValue) { stop(); lookup(codes[0].rawValue); return; } } catch {}
        requestAnimationFrame(tick);
      };
      tick();
    } catch { setState({ kind: 'error', msg: 'Could not access the camera. Allow camera permission or paste the code.' }); stop(); }
  }

  const b = state.booking;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="card p-6">
        <button className="btn-primary w-full" onClick={scanning ? stop : scan}><Camera className="h-5 w-5" />{scanning ? 'Stop camera' : 'Scan QR with camera'}</button>
        {scanning && <video ref={video} className="mt-4 aspect-square w-full rounded-2xl bg-black object-cover" muted playsInline />}
        <div className="my-4 flex items-center gap-3 text-xs text-ink-400"><span className="h-px flex-1 bg-ink-100" />or enter manually<span className="h-px flex-1 bg-ink-100" /></div>
        <form onSubmit={(e) => { e.preventDefault(); lookup(token); }} className="flex gap-2"><input className="input font-mono" placeholder="Paste QR link or token" value={token} onChange={(e) => setToken(e.target.value)} /><button className="btn-outline"><ScanLine className="h-4 w-4" />Verify</button></form>
      </div>

      {state.kind === 'loading' && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {state.kind === 'error' && <div className="flex gap-3 rounded-2xl bg-red-50 p-5 text-red-800"><XCircle className="h-6 w-6 shrink-0" /><div><p className="font-bold">Not valid</p><p className="text-sm">{state.msg}</p></div></div>}
      {(state.kind === 'found' || state.kind === 'done') && b && (
        <div className="card overflow-hidden">
          {state.kind === 'done' ? (
            <div className={`flex items-center gap-3 px-6 py-4 text-white ${state.result === 'ok' ? 'bg-emerald-600' : 'bg-amber-500'}`}>{state.result === 'ok' ? <CheckCircle2 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}<p className="font-bold">{state.result === 'ok' ? 'Checked in successfully' : state.result === 'already' ? 'Already checked in earlier' : 'Booking is cancelled, do not admit'}</p></div>
          ) : b.status !== 'confirmed' ? (
            <div className="flex items-center gap-3 bg-red-600 px-6 py-4 text-white"><XCircle className="h-7 w-7" /><p className="font-bold">Booking is {b.status}. Do not admit.</p></div>
          ) : b.checked_in_at ? (
            <div className="flex items-center gap-3 bg-amber-500 px-6 py-4 text-white"><AlertTriangle className="h-7 w-7" /><p className="font-bold">Already checked in at {fmtTime(b.checked_in_at)}</p></div>
          ) : <div className="flex items-center gap-3 bg-brand-700 px-6 py-4 text-white"><CheckCircle2 className="h-7 w-7" /><p className="font-bold">Valid booking</p></div>}
          <dl className="divide-y divide-ink-100 px-6 py-2 text-sm">
            {[['Reference', <span key="r" className="font-mono font-bold">{b.ref}</span>], ['Customer', b.customer_name], ['Turf', b.turf_name], ['Date', fmtDate(b.start_ts)], ['Time', `${fmtTime(b.start_ts)} – ${fmtTime(b.end_ts)} (${fmtDuration(b.duration_min)})`], ['Amount', inr(b.total)], ['Payment', <PayBadge key="p" status={b.payment_status} />]].map(([k, v], i) => <div key={i} className="flex justify-between gap-4 py-2.5"><dt className="text-ink-500">{k as string}</dt><dd className="text-right font-medium">{v as any}</dd></div>)}
          </dl>
          {state.kind === 'found' && b.status === 'confirmed' && !b.checked_in_at && <div className="p-6 pt-3"><button className="btn-accent btn-lg w-full" onClick={confirm}>Mark as checked in</button></div>}
        </div>
      )}
    </div>
  );
}
