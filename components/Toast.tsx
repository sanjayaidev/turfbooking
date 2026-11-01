'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

/** Shows ?msg=… / ?err=… once, then removes it from the URL. */
export default function Toast() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [t, setT] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => {
    const msg = sp.get('msg'), err = sp.get('err');
    if (msg || err) {
      setT({ kind: err ? 'err' : 'ok', text: (err || msg) as string });
      const next = new URLSearchParams(sp.toString());
      next.delete('msg'); next.delete('err');
      router.replace(next.toString() ? `${path}?${next}` : path, { scroll: false });
      const id = setTimeout(() => setT(null), 5000);
      return () => clearTimeout(id);
    }
  }, [sp]); // eslint-disable-line
  if (!t) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-pop ${t.kind === 'ok' ? 'border-emerald-200 bg-white text-emerald-800' : 'border-red-200 bg-white text-red-700'}`}>
        {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
        <p className="flex-1 text-sm font-medium">{t.text}</p>
        <button onClick={() => setT(null)} aria-label="Dismiss"><X className="h-4 w-4 opacity-60" /></button>
      </div>
    </div>
  );
}
