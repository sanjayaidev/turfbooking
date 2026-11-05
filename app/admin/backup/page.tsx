import { Download, ShieldAlert } from 'lucide-react';
import { requirePerm } from '@/lib/auth';
import { liveCounts, unregisteredTables } from '@/lib/backup';
import { PageHeader } from '@/components/ui';
import RestoreClient from '@/components/RestoreClient';

export const metadata = { title: 'Backup & restore' };

export default async function BackupPage() {
  await requirePerm('admin');
  const [counts, extra] = await Promise.all([liveCounts(), unregisteredTables()]);
  const total = counts.reduce((a, c) => a + c.rows, 0);
  return (
    <>
      <PageHeader title="Backup & restore" subtitle="Download everything as an Excel workbook, and restore only what is missing or different." />
      {extra.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>These tables are not covered by the backup yet: <b>{extra.join(', ')}</b>. Add them to <code className="rounded bg-white/70 px-1">BACKUP_TABLES</code> in <code className="rounded bg-white/70 px-1">lib/backup.ts</code>.</p>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-5">
        <section className="card space-y-4 p-6 xl:col-span-2">
          <div><h2 className="font-bold">Download a backup</h2><p className="mt-1 text-sm text-ink-500">One .xlsx file with a sheet for every table ({counts.length} sheets, {total.toLocaleString('en-IN')} rows right now).</p></div>
          <a href="/api/admin/backup" className="btn-primary w-full sm:w-auto"><Download className="h-4 w-4" />Download backup (.xlsx)</a>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
            {counts.map((c) => <li key={c.table} className="flex items-center justify-between px-3 py-2"><span className="capitalize text-ink-700">{c.table.replace(/_/g, ' ')}</span><span className="tabular-nums text-ink-500">{c.rows.toLocaleString('en-IN')}</span></li>)}
          </ul>
          <p className="flex items-start gap-2 text-xs text-ink-500"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />The file contains customer details and password hashes. Store it somewhere private and do not edit the sheet or column names.</p>
        </section>

        <section className="card space-y-4 p-6 xl:col-span-3">
          <div><h2 className="font-bold">Restore from a backup</h2><p className="mt-1 text-sm text-ink-500">Each sheet is compared with the live table by its ID. Missing rows are added and changed rows are updated. Rows that only exist in the database are never deleted.</p></div>
          <RestoreClient />
        </section>
      </div>
    </>
  );
}
