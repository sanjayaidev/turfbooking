import { NextRequest } from 'next/server';
import { audit, guard } from '@/lib/auth';
import { applyRestore, BACKUP_TABLES, previewRestore, readBackup, RestoreInputError } from '@/lib/backup';
import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * POST multipart: file (the .xlsx), mode = "preview" | "apply", tables (optional, repeated; apply only).
 * The file is parsed and compared with the live data on every call, so "apply" always acts on the
 * database as it is now, never on a stale preview.
 */
export async function POST(req: NextRequest) {
  const g = await guard('admin');
  if ('error' in g) return g.error;
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    const mode = String(fd.get('mode') || 'preview');
    // Not `instanceof File`: Node 18 (allowed by "engines") has no global File, so that line throws there.
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || file.size === 0) return fail('Choose a backup file (.xlsx) first.');
    if (file.size > MAX_BYTES) return fail('That file is larger than 50 MB.');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return fail('That is not an Excel (.xlsx) file.');

    const parsed = await readBackup(bytes);

    if (mode === 'preview') {
      return ok({ preview: await previewRestore(parsed) });
    }
    if (mode === 'apply') {
      const known = new Set(BACKUP_TABLES.map((t) => t.name));
      const picked = fd.getAll('tables').map(String).filter((t) => known.has(t));
      if (!picked.length) return fail('Pick at least one table to restore.');
      const result = await applyRestore(parsed, picked);
      // the restore is already committed: a failure to log it must not be reported as a failed restore
      try { await audit(g.user, 'backup.restore', 'backup', null, { file: file.name, backupCreatedAt: parsed.createdAt, inserted: result.inserted, updated: result.updated, skipped: result.skipped, tables: result.tables.map((t) => t.table) }); }
      catch (e) { console.error('Could not write the backup.restore audit entry', e); }
      return ok({ result });
    }
    return fail('Unknown mode.');
  } catch (e) {
    if (e instanceof RestoreInputError) return fail(e.message);
    return handle(e);
  }
}
