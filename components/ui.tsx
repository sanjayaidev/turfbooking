import clsx from 'clsx';
import { ReactNode } from 'react';

export const cn = clsx;

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  yellow: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  grey: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
};
export function Badge({ tone = 'grey', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={cn('badge', TONES[tone] || TONES.grey)}>{children}</span>;
}

export function StatusBadge({ status, start, end, checkedIn }: { status: string; start?: any; end?: any; checkedIn?: boolean }) {
  if (status === 'confirmed') {
    if (checkedIn) return <Badge tone="purple">Checked in</Badge>;
    if (end && new Date(end).getTime() < Date.now()) return <Badge tone="blue">Completed</Badge>;
    return <Badge tone="green">Confirmed</Badge>;
  }
  if (status === 'reserved') return <Badge tone="yellow">Awaiting payment</Badge>;
  if (status === 'cancelled') return <Badge tone="red">Cancelled</Badge>;
  return <Badge tone="grey">Expired</Badge>;
}
export function PayBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    successful: ['green', 'Paid'], pending: ['yellow', 'Pending'], failed: ['red', 'Failed'], refunded: ['blue', 'Refunded'], partially_refunded: ['blue', 'Part refunded'],
  };
  const [tone, label] = map[status] || ['grey', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
      </div>
      <p className="font-semibold text-ink-800">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}
