import { fmtMin } from '@/lib/time';

/** Half-hour time <select> (minutes from midnight; 1440 = midnight at day end). */
export function TimeSelect({ name, value, step = 30, endOfDay = false, className = 'input' }: { name: string; value: number; step?: number; endOfDay?: boolean; className?: string }) {
  const opts: number[] = [];
  for (let m = 0; m <= (endOfDay ? 1440 : 1410); m += step) opts.push(m);
  return <select name={name} defaultValue={value} className={className}>{opts.map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}</select>;
}
