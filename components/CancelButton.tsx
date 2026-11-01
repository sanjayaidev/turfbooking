'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CancelButton({ id, refundText }: { id: string; refundText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true);
    const r = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    if (j.ok) { router.push(`/bookings/${id}?msg=${encodeURIComponent('Booking cancelled')}`); router.refresh(); } else { setErr(j.error); setBusy(false); }
  }
  return (
    <>
      <button className="btn-outline text-red-600" onClick={() => setOpen(true)}>Cancel booking</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Cancel this booking?</h3>
            <p className="mt-2 text-sm text-ink-600">{refundText}</p>
            {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <div className="mt-5 flex gap-2"><button className="btn-outline flex-1" onClick={() => setOpen(false)}>Keep booking</button><button className="btn-danger flex-1" disabled={busy} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, cancel'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
