import { inr } from '@/lib/time';

export function BarChart({ data, height = 180 }: { data: { label: string; value: number; sub?: string }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-pop group-hover:block">{d.sub || d.label}: {inr(d.value)}</div>
            <div className="w-full rounded-t-md bg-brand-500/90 transition group-hover:bg-brand-700" style={{ height: `${Math.max(d.value ? 4 : 1, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2">{data.map((d, i) => <span key={i} className="flex-1 text-center text-[10px] font-medium text-ink-400">{d.label}</span>)}</div>
    </div>
  );
}

export function HBar({ rows, color = 'bg-brand-500' }: { rows: { label: string; value: number; display?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink-700">{r.label}</span><span className="font-semibold text-ink-900">{r.display ?? r.value}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, hint, tone = 'default', icon }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'green' | 'red' | 'amber'; icon?: React.ReactNode }) {
  const t = { default: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600' }[tone];
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between"><p className="text-sm font-medium text-ink-500">{label}</p>{icon && <span className={`grid h-9 w-9 place-items-center rounded-xl ${t}`}>{icon}</span>}</div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
