import { q } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { fmtDateTime } from '@/lib/time';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Audit log' };

export default async function Audit() {
  await requirePerm('admin');
  const rows = await q<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sensitive action by admins and staff, newest first." />
      <div className="card overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Target</th><th className="th">Details</th></tr></thead>
        <tbody className="divide-y divide-ink-100">{rows.map((r: any) => <tr key={r.id}><td className="td whitespace-nowrap text-xs text-ink-500">{fmtDateTime(r.created_at)}</td><td className="td font-medium">{r.user_name}</td><td className="td font-mono text-xs">{r.action}</td><td className="td text-xs text-ink-500">{r.entity}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ''}</td><td className="td max-w-xs truncate font-mono text-[11px] text-ink-400">{r.details ? JSON.stringify(r.details) : ''}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-ink-500">No activity yet.</td></tr>}</tbody></table></div>
    </>
  );
}
