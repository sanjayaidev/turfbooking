'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import type { ApplyResult, Preview, TableDiff } from '@/lib/backup';
import { Badge, cn } from './ui';

type Stage = 'pick' | 'previewing' | 'preview' | 'applying' | 'done';

const label = (t: string) => t.replace(/_/g, ' ');

export default function RestoreClient() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);

  function reset() {
    setFile(null); setStage('pick'); setError(''); setPreview(null); setPicked({}); setOpen({}); setResult(null);
    if (input.current) input.current.value = '';
  }

  async function send(mode: 'preview' | 'apply', tables: string[] = []) {
    const fd = new FormData();
    fd.set('file', file as File);
    fd.set('mode', mode);
    tables.forEach((t) => fd.append('tables', t));
    const res = await fetch('/api/admin/backup/restore', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  async function runPreview() {
    if (!file) return;
    setError(''); setStage('previewing');
    try {
      const { preview: p } = (await send('preview')) as { preview: Preview };
      setPreview(p);
      setPicked(Object.fromEntries(p.tables.map((t) => [t.table, t.newCount + t.changedCount > 0])));
      setStage('preview');
    } catch (e: any) { setError(e.message); setStage('pick'); }
  }

  const chosen = preview ? preview.tables.filter((t) => picked[t.table]) : [];
  const toWrite = chosen.reduce((a, t) => a + t.newCount + t.changedCount, 0);

  async function runApply() {
    if (!preview || !toWrite) return;
    if (!window.confirm(`Restore ${toWrite} row${toWrite === 1 ? '' : 's'} from this backup?\n\nOnly new and changed rows are written. Nothing is deleted.`)) return;
    setError(''); setStage('applying');
    try {
      const { result: r } = (await send('apply', chosen.map((t) => t.table))) as { result: ApplyResult };
      setResult(r); setStage('done'); router.refresh();
    } catch (e: any) { setError(e.message); setStage('preview'); }
  }

  const busy = stage === 'previewing' || stage === 'applying';

  return (
    <div className="space-y-5">
      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {(stage === 'pick' || stage === 'previewing') && (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
            <FileSpreadsheet className="h-8 w-8 text-brand-700" />
            <span className="font-semibold text-ink-800">{file ? file.name : 'Choose a backup file (.xlsx)'}</span>
            <span className="text-xs text-ink-500">{file ? `${(file.size / 1024).toFixed(0)} KB · click to pick a different file` : 'The workbook you downloaded from this page'}</span>
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
          </label>
          <button className="btn-primary" disabled={!file || busy} onClick={runPreview}>
            {stage === 'previewing' ? <><Loader2 className="h-4 w-4 animate-spin" />Comparing…</> : <><Upload className="h-4 w-4" />Compare with current data</>}
          </button>
          <p className="text-xs text-ink-400">Nothing is changed yet. You will see exactly what would be added or updated first.</p>
        </div>
      )}

      {(stage === 'preview' || stage === 'applying') && preview && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600">
            <p><b className="text-ink-900">{file?.name}</b>{preview.createdAt && <> · backup taken {new Date(preview.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</>}{preview.createdBy && <> by {preview.createdBy}</>}</p>
            <button className="btn-ghost btn-sm" onClick={reset} disabled={busy}>Choose another file</button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat n={preview.totals.new} title="New rows" hint="Missing from the database" tone="green" />
            <Stat n={preview.totals.changed} title="Changed rows" hint="Values differ" tone="amber" />
            <Stat n={preview.totals.unchanged} title="Already identical" hint="Left alone" tone="grey" />
            <Stat n={preview.totals.onlyInDatabase} title="Only in database" hint="Kept, never deleted" tone="blue" />
          </div>

          {preview.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {preview.warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
            </ul>
          )}

          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th w-10"></th><th className="th">Table</th><th className="th text-right">New</th><th className="th text-right">Changed</th><th className="th text-right">Identical</th><th className="th text-right">Only in DB</th><th className="th w-10"></th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {preview.tables.map((t) => {
                  const writes = t.newCount + t.changedCount;
                  const expandable = writes > 0 || t.invalid.length > 0 || t.ignoredColumns.length > 0;
                  return (
                    <TableRow key={t.table} t={t} writes={writes} expandable={expandable} checked={!!picked[t.table]} open={!!open[t.table]} disabled={busy}
                      onCheck={(v) => setPicked((p) => ({ ...p, [t.table]: v }))} onToggle={() => setOpen((o) => ({ ...o, [t.table]: !o[t.table] }))} />
                  );
                })}
              </tbody>
            </table>
          </div>

          {toWrite === 0
            ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">The database already matches this backup for the selected tables. Nothing to restore.</p>
            : <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" onClick={runApply} disabled={busy}>
                  {stage === 'applying' ? <><Loader2 className="h-4 w-4 animate-spin" />Restoring…</> : <>Restore {toWrite} row{toWrite === 1 ? '' : 's'}</>}
                </button>
                <span className="text-xs text-ink-500">Adds the new rows and updates the changed ones. Nothing is deleted.</span>
              </div>}
        </div>
      )}

      {stage === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm font-medium">Restore finished: {result.inserted} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ''}.</p>
          </div>
          {result.tables.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-[480px]"><thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th">Table</th><th className="th text-right">Added</th><th className="th text-right">Updated</th><th className="th text-right">Skipped</th></tr></thead>
                <tbody className="divide-y divide-ink-100">{result.tables.map((t) => (
                  <tr key={t.table} className="align-top"><td className="td font-medium capitalize">{label(t.table)}</td><td className="td text-right">{t.inserted}</td><td className="td text-right">{t.updated}</td>
                    <td className="td text-right">{t.skippedCount}
                      {t.skippedCount > 0 && <ul className="mt-1 space-y-0.5 text-left text-[11px] text-red-700">{t.skipped.slice(0, 10).map((s, i) => <li key={i}><span className="font-mono">{s.key.slice(0, 36)}</span>: {s.reason}</li>)}{t.skippedCount > 10 && <li>…and {t.skippedCount - 10} more</li>}</ul>}</td></tr>))}</tbody></table>
            </div>
          )}
          <button className="btn-outline" onClick={reset}>Restore another file</button>
        </div>
      )}
    </div>
  );
}

function Stat({ n, title, hint, tone }: { n: number; title: string; hint: string; tone: 'green' | 'amber' | 'grey' | 'blue' }) {
  const colors = { green: 'text-emerald-700', amber: 'text-amber-700', grey: 'text-ink-700', blue: 'text-sky-700' };
  return <div className="rounded-xl border border-ink-100 bg-white p-4"><p className={cn('font-display text-2xl font-extrabold', colors[tone])}>{n.toLocaleString('en-IN')}</p><p className="text-sm font-semibold text-ink-800">{title}</p><p className="text-xs text-ink-400">{hint}</p></div>;
}

function TableRow({ t, writes, expandable, checked, open, disabled, onCheck, onToggle }: { t: TableDiff; writes: number; expandable: boolean; checked: boolean; open: boolean; disabled: boolean; onCheck: (v: boolean) => void; onToggle: () => void }) {
  return (
    <>
      <tr className={cn(writes === 0 && 'text-ink-400')}>
        <td className="td"><input type="checkbox" aria-label={`Restore ${label(t.table)}`} className="h-4 w-4 rounded border-ink-300 text-brand-700" checked={checked} disabled={disabled || writes === 0} onChange={(e) => onCheck(e.target.checked)} /></td>
        <td className="td font-medium capitalize">{label(t.table)} {t.invalid.length > 0 && <Badge tone="red">{t.invalid.length} unreadable</Badge>}</td>
        <td className={cn('td text-right', t.newCount > 0 && 'font-semibold text-emerald-700')}>{t.newCount}</td>
        <td className={cn('td text-right', t.changedCount > 0 && 'font-semibold text-amber-700')}>{t.changedCount}</td>
        <td className="td text-right">{t.unchanged}</td>
        <td className="td text-right">{t.onlyInDatabase}</td>
        <td className="td">{expandable && <button onClick={onToggle} aria-label="Show details" aria-expanded={open} className="rounded p-1 hover:bg-ink-100"><ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} /></button>}</td>
      </tr>
      {open && (
        <tr className="bg-ink-50/60"><td></td><td colSpan={6} className="px-4 pb-4 text-xs">
          {t.samples.new.length > 0 && <div className="mb-3"><p className="mb-1 font-semibold text-emerald-700">New rows{t.newCount > t.samples.new.length ? ` (first ${t.samples.new.length} of ${t.newCount})` : ''}</p><p className="font-mono text-ink-500">{t.samples.new.map((s) => s.key.slice(0, 36)).join('  ·  ')}</p></div>}
          {t.samples.changed.length > 0 && <div className="mb-3"><p className="mb-1 font-semibold text-amber-700">Changed rows{t.changedCount > t.samples.changed.length ? ` (first ${t.samples.changed.length} of ${t.changedCount})` : ''}</p>
            <ul className="space-y-1.5">{t.samples.changed.map((s) => <li key={s.key}><span className="font-mono text-ink-500">{s.key.slice(0, 36)}</span><ul className="ml-3">{s.changes.map((c) => <li key={c.column}><b>{c.column}</b>: <span className="text-red-700 line-through">{c.from ?? 'empty'}</span> → <span className="text-emerald-700">{c.to ?? 'empty'}</span></li>)}</ul></li>)}</ul></div>}
          {t.invalid.length > 0 && <div className="mb-3"><p className="mb-1 font-semibold text-red-700">Rows that could not be read (skipped)</p><ul>{t.invalid.slice(0, 8).map((r, i) => <li key={i}>Row {r.line}: {r.reason}</li>)}{t.invalid.length > 8 && <li>…and {t.invalid.length - 8} more</li>}</ul></div>}
          {t.ignoredColumns.length > 0 && <p className="text-ink-500">Columns in the file that no longer exist and are ignored: {t.ignoredColumns.join(', ')}</p>}
        </td></tr>
      )}
    </>
  );
}
