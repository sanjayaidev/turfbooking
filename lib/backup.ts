import ExcelJS from 'exceljs';
import type { PoolClient } from 'pg';
import { pool, tx } from './db';

/**
 * Backup & delta restore.
 *
 * Backup  = one .xlsx workbook, one sheet per table (+ a `_backup_info` sheet).
 * Restore = compare each sheet with the live table by primary key and apply only the difference:
 *           rows missing from the database are inserted, rows whose values differ are updated.
 *           Rows that exist only in the database are NEVER deleted.
 *
 * Values are written in a lossless text form (timestamps with microseconds, JSON, arrays), so a
 * backup that is restored straight away produces an empty delta.
 */

export type TableDef = { name: string; pk: string[] };

/** Parents before children, so inserts satisfy foreign keys. Add new tables here when the schema grows. */
export const BACKUP_TABLES: TableDef[] = [
  { name: 'users', pk: ['id'] },
  { name: 'turfs', pk: ['id'] },
  { name: 'operating_hours', pk: ['turf_id', 'dow'] },
  { name: 'pricing_rules', pk: ['id'] },
  { name: 'blocks', pk: ['id'] },
  { name: 'coupons', pk: ['id'] },
  { name: 'ref_counters', pk: ['day'] },
  { name: 'bookings', pk: ['id'] },
  { name: 'payments', pk: ['id'] },
  { name: 'email_log', pk: ['id'] },
  { name: 'audit_logs', pk: ['id'] },
  { name: 'settings', pk: ['key'] },
];

const INFO_SHEET = '_backup_info';
const MARKER = 'turfbooking-backup';
const FORMAT_VERSION = 1;
const CELL_LIMIT = 30000; // Excel allows 32 767 characters per cell; longer text is split over `col~2`, `col~3`, …
const SAMPLE_LIMIT = 25; // rows listed per category in a preview
const SKIP_LIMIT = 100; // skipped rows listed per table after an apply
const LOCK_KEY = 7_424_001; // advisory lock so two restores never interleave

/** Never shown in previews or error text. */
const SENSITIVE = new Set(['users.password_hash']);

type Kind = 'text' | 'number' | 'bool' | 'json' | 'array' | 'timestamp' | 'date';
type Col = { name: string; kind: Kind; sel: string; cast: string; notNull: boolean; uuid: boolean };
type Row = Record<string, any>;

// ───────────────────────────── column metadata ─────────────────────────────

const qi = (s: string) => '"' + s.replace(/"/g, '""') + '"';

async function columnsOf(c: PoolClient, table: string): Promise<Col[]> {
  const { rows } = await c.query(
    `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r: any): Col => {
    const n = qi(r.column_name);
    const base = { name: r.column_name as string, notNull: r.is_nullable === 'NO', uuid: r.udt_name === 'uuid' };
    switch (r.data_type) {
      case 'timestamp with time zone':
        return { ...base, kind: 'timestamp', sel: `to_char(${n} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, cast: 'timestamptz' };
      case 'date':
        return { ...base, kind: 'date', sel: `to_char(${n},'YYYY-MM-DD')`, cast: 'date' };
      case 'integer': case 'bigint': case 'smallint': case 'numeric': case 'double precision': case 'real':
        return { ...base, kind: 'number', sel: n, cast: r.data_type === 'numeric' ? 'numeric' : r.udt_name };
      case 'boolean':
        return { ...base, kind: 'bool', sel: n, cast: 'boolean' };
      case 'jsonb': case 'json':
        return { ...base, kind: 'json', sel: `${n}::text`, cast: r.data_type };
      case 'ARRAY':
        return { ...base, kind: 'array', sel: `to_json(${n})::text`, cast: `${String(r.udt_name).replace(/^_/, '')}[]` };
      default:
        return { ...base, kind: 'text', sel: n, cast: r.data_type === 'uuid' ? 'uuid' : 'text' };
    }
  });
}

// ───────────────────────────── value handling ─────────────────────────────

class BadValue extends Error {}

function plain(v: any): any {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plain(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return String(v.text);
    return null; // error cells etc.
  }
  return v;
}

const sortKeys = (v: any): any =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

const pad6 = (s: string) => s.replace(/\.(\d{1,6})\d*Z$/, (_m, f) => `.${f.padEnd(6, '0')}Z`);

/** Turns a raw cell (or live value) into one canonical JS value so both sides compare with ===. */
function coerce(col: Col, raw: any): any {
  let v = plain(raw);
  if (typeof v === 'string' && v === '') v = null;
  if (v == null) return col.kind === 'text' && col.notNull ? '' : null;
  switch (col.kind) {
    case 'text': {
      const s = String(v);
      return col.uuid ? s.trim().toLowerCase() : s;
    }
    case 'number': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
      if (!Number.isFinite(n)) throw new BadValue(`"${String(v).slice(0, 40)}" is not a number`);
      return n;
    }
    case 'bool': {
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      if (['true', 'yes', '1'].includes(s)) return true;
      if (['false', 'no', '0'].includes(s)) return false;
      throw new BadValue(`"${String(v).slice(0, 40)}" is not true/false`);
    }
    case 'json': {
      try { return JSON.stringify(sortKeys(typeof v === 'string' ? JSON.parse(v) : v)); }
      catch { throw new BadValue('is not valid JSON'); }
    }
    case 'array': {
      try {
        const a = typeof v === 'string' ? JSON.parse(v) : v;
        if (!Array.isArray(a)) throw new Error();
        return a;
      } catch { throw new BadValue('is not a valid list (expected JSON like ["a","b"])'); }
    }
    case 'timestamp': {
      if (v instanceof Date) { if (isNaN(+v)) throw new BadValue('is not a valid date/time'); return pad6(v.toISOString()); }
      const s = String(v).trim();
      if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(s)) return pad6(s.includes('.') ? s : s.replace('Z', '.000000Z'));
      const d = new Date(s);
      if (isNaN(+d)) throw new BadValue(`"${s.slice(0, 40)}" is not a valid date/time`);
      return pad6(d.toISOString());
    }
    case 'date': {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim().slice(0, 10);
      if (!/^\d{4}-\d\d-\d\d$/.test(s)) throw new BadValue(`"${s}" is not a date (expected YYYY-MM-DD)`);
      return s;
    }
  }
}

const same = (col: Col, a: any, b: any) => (col.kind === 'array' ? JSON.stringify(a) === JSON.stringify(b) : a === b);
const keyOf = (pk: string[], r: Row) => pk.map((k) => String(r[k])).join('\u0001');
const readable = (table: string, col: string, v: any) => {
  if (SENSITIVE.has(`${table}.${col}`)) return v == null ? null : '••••••';
  const s = Array.isArray(v) ? JSON.stringify(v) : v == null ? null : String(v);
  return s && s.length > 80 ? s.slice(0, 77) + '…' : s;
};

/** Value to hand to node-postgres: arrays are serialised by pg, json stays a canonical JSON string (cast to jsonb in SQL). */
const toParam = (_col: Col, v: any) => (v == null ? null : v);

// ───────────────────────────── export ─────────────────────────────

export type BackupSummary = { table: string; rows: number }[];

export async function buildBackup(by: string): Promise<{ buffer: Buffer; summary: BackupSummary }> {
  const c = await pool.connect();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TurfBooking';
  wb.created = new Date();
  const summary: BackupSummary = [];
  const info = wb.addWorksheet(INFO_SHEET);
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); // one consistent snapshot across all tables
    for (const t of BACKUP_TABLES) {
      const cols = await columnsOf(c, t.name);
      if (!cols.length) continue; // table not present in this database
      const { rows } = await c.query(`SELECT ${cols.map((x) => `${x.sel} AS ${qi(x.name)}`).join(', ')} FROM ${qi(t.name)} ORDER BY ${t.pk.map(qi).join(', ')}`);

      // long text → extra columns
      const parts: Record<string, number> = {};
      for (const col of cols) {
        if (col.kind !== 'text' && col.kind !== 'json' && col.kind !== 'array') continue;
        let max = 0;
        for (const r of rows) { const v = r[col.name]; if (typeof v === 'string' && v.length > max) max = v.length; }
        if (max > CELL_LIMIT) parts[col.name] = Math.ceil(max / CELL_LIMIT);
      }
      const header = cols.map((x) => x.name);
      for (const [name, n] of Object.entries(parts)) for (let i = 2; i <= n; i++) header.push(`${name}~${i}`);

      const ws = wb.addWorksheet(t.name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.addRow(header);
      const widths = header.map((h) => h.length);
      for (const r of rows) {
        const out: any[] = cols.map((col) => {
          const v = r[col.name];
          if (v == null) return null;
          if (typeof v === 'string' && v.length > CELL_LIMIT) return v.slice(0, CELL_LIMIT);
          return v;
        });
        for (const [name, n] of Object.entries(parts)) {
          const v: string = r[name] ?? '';
          for (let i = 2; i <= n; i++) out.push(v.slice((i - 1) * CELL_LIMIT, i * CELL_LIMIT) || null);
        }
        ws.addRow(out);
        for (let i = 0; i < out.length && i < 60; i++) { const l = out[i] == null ? 0 : String(out[i]).length; if (l > widths[i]) widths[i] = l; }
      }
      header.forEach((_, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(widths[i] + 2, 8), 48); });
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
      summary.push({ table: t.name, rows: rows.length });
    }
    await c.query('COMMIT');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    c.release();
  }

  info.addRow([MARKER, FORMAT_VERSION]);
  info.addRow(['created_at', new Date().toISOString()]);
  info.addRow(['created_by', by]);
  info.addRow(['note', 'Restore compares each sheet with the live table by primary key and applies only the difference. It never deletes rows.']);
  info.addRow([]);
  info.addRow(['sheet', 'rows', 'primary_key']);
  info.getRow(6).font = { bold: true };
  for (const s of summary) info.addRow([s.table, s.rows, BACKUP_TABLES.find((t) => t.name === s.table)!.pk.join(', ')]);
  info.getColumn(1).width = 24; info.getColumn(2).width = 40; info.getColumn(3).width = 22;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, summary };
}

// ───────────────────────────── reading a backup ─────────────────────────────

export type ParsedSheet = { headers: string[]; rows: { line: number; raw: Row }[] };
export type ParsedBackup = { createdAt: string | null; createdBy: string | null; expected: Record<string, number>; sheets: Record<string, ParsedSheet>; warnings: string[] };

export class RestoreInputError extends Error {}

export async function readBackup(data: Buffer): Promise<ParsedBackup> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(data as any); } catch { throw new RestoreInputError('That file could not be read as an Excel (.xlsx) workbook.'); }

  const info = wb.getWorksheet(INFO_SHEET);
  const a1 = info ? plain(info.getCell('A1').value) : null;
  if (!info || a1 !== MARKER) throw new RestoreInputError('This is not a TurfBooking backup. Upload a file downloaded from Backup & restore.');
  const version = Number(plain(info.getCell('B1').value));
  if (!(version >= 1) || version > FORMAT_VERSION) throw new RestoreInputError(`This backup uses a newer format (v${version}) than this app understands (v${FORMAT_VERSION}). Update the app first.`);

  const meta: Record<string, any> = {};
  const expected: Record<string, number> = {};
  let inTable = false;
  info.eachRow((row) => {
    const k = plain(row.getCell(1).value), v = plain(row.getCell(2).value);
    if (k === 'sheet') { inTable = true; return; }
    if (inTable) { if (typeof k === 'string') expected[k] = Number(v); } else if (typeof k === 'string') meta[k] = v;
  });

  const warnings: string[] = [];
  const sheets: Record<string, ParsedSheet> = {};
  for (const t of BACKUP_TABLES) {
    const ws = wb.getWorksheet(t.name);
    if (!ws) { warnings.push(`Sheet "${t.name}" is missing from the file, so that table is left as it is.`); continue; }
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, n) => { const h = plain(cell.value); if (h != null) headers[n] = String(h).trim(); });
    const rows: ParsedSheet['rows'] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const raw: Row = {};
      let any = false;
      headers.forEach((h, n) => {
        if (!h) return;
        const v = plain(row.getCell(n).value);
        if (v == null || v === '') return;
        any = true;
        const m = /^(.+)~(\d+)$/.exec(h);
        if (m) raw[m[1]] = (raw[m[1]] ?? '') + String(v); // continuation of a long cell
        else raw[h] = v;
      });
      if (any) rows.push({ line: r, raw });
    }
    sheets[t.name] = { headers: headers.filter((h) => h && !/~\d+$/.test(h)), rows };
    if (expected[t.name] != null && expected[t.name] !== rows.length) warnings.push(`Sheet "${t.name}" has ${rows.length} rows but the backup recorded ${expected[t.name]}. Rows may have been added or removed by hand.`);
  }
  return { createdAt: meta.created_at ? String(meta.created_at) : null, createdBy: meta.created_by ? String(meta.created_by) : null, expected, sheets, warnings };
}

// ───────────────────────────── delta ─────────────────────────────

export type Change = { column: string; from: string | null; to: string | null };
export type TableDiff = {
  table: string;
  inFile: number;
  inDatabase: number;
  newCount: number;
  changedCount: number;
  unchanged: number;
  onlyInDatabase: number; // kept, never deleted
  invalid: { line: number; reason: string }[];
  ignoredColumns: string[]; // in the file but not in the database any more
  missingColumns: string[]; // in the database but not in the file (left untouched)
  samples: { new: { key: string }[]; changed: { key: string; changes: Change[] }[] };
};
type Plan = { diff: TableDiff; cols: Col[]; shared: Col[]; pk: string[]; inserts: Row[]; updates: { row: Row; changed: string[] }[] };

async function planTable(c: PoolClient, t: TableDef, sheet: ParsedSheet | undefined): Promise<Plan | null> {
  const cols = await columnsOf(c, t.name);
  if (!cols.length || !sheet) return null;
  const byName = new Map(cols.map((x) => [x.name, x]));
  const shared = sheet.headers.filter((h) => byName.has(h)).map((h) => byName.get(h)!);
  const ignoredColumns = sheet.headers.filter((h) => !byName.has(h));
  const missingColumns = cols.filter((x) => !sheet.headers.includes(x.name)).map((x) => x.name);
  const diff: TableDiff = { table: t.name, inFile: sheet.rows.length, inDatabase: 0, newCount: 0, changedCount: 0, unchanged: 0, onlyInDatabase: 0, invalid: [], ignoredColumns, missingColumns, samples: { new: [], changed: [] } };
  const plan: Plan = { diff, cols, shared, pk: t.pk, inserts: [], updates: [] };

  const missingPk = t.pk.filter((k) => !sheet.headers.includes(k));
  if (missingPk.length) {
    diff.invalid.push({ line: 1, reason: `The sheet has no "${missingPk.join('", "')}" column, so rows cannot be matched. The sheet was skipped.` });
    return plan;
  }

  // live rows, in the same canonical form
  const { rows: liveRaw } = await c.query(`SELECT ${shared.map((x) => `${x.sel} AS ${qi(x.name)}`).join(', ')} FROM ${qi(t.name)}`);
  const live = new Map<string, Row>();
  for (const r of liveRaw) { const row: Row = {}; for (const col of shared) row[col.name] = coerce(col, r[col.name]); live.set(keyOf(t.pk, row), row); }
  const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM ${qi(t.name)}`);
  diff.inDatabase = n;

  const seen = new Set<string>();
  for (const { line, raw } of sheet.rows) {
    const row: Row = {};
    try {
      for (const col of shared) {
        try { row[col.name] = coerce(col, raw[col.name]); }
        catch (e) { if (e instanceof BadValue) throw new BadValue(`${col.name} ${e.message}`); throw e; }
      }
      for (const k of t.pk) if (row[k] == null || row[k] === '') throw new BadValue(`${k} is empty`);
    } catch (e) {
      if (e instanceof BadValue) { diff.invalid.push({ line, reason: e.message }); continue; }
      throw e;
    }
    const key = keyOf(t.pk, row);
    if (seen.has(key)) { diff.invalid.push({ line, reason: 'Duplicate primary key in the sheet (first one is used).' }); continue; }
    seen.add(key);

    const cur = live.get(key);
    const label = t.pk.map((k) => String(row[k])).join(' / ');
    if (!cur) {
      diff.newCount++; plan.inserts.push(row);
      if (diff.samples.new.length < SAMPLE_LIMIT) diff.samples.new.push({ key: label });
      continue;
    }
    const changed = shared.filter((col) => !t.pk.includes(col.name) && !same(col, row[col.name], cur[col.name]));
    if (!changed.length) { diff.unchanged++; continue; }
    diff.changedCount++; plan.updates.push({ row, changed: changed.map((x) => x.name) });
    if (diff.samples.changed.length < SAMPLE_LIMIT) diff.samples.changed.push({ key: label, changes: changed.map((col) => ({ column: col.name, from: readable(t.name, col.name, cur[col.name]), to: readable(t.name, col.name, row[col.name]) })) });
  }
  diff.onlyInDatabase = [...live.keys()].filter((k) => !seen.has(k)).length;
  return plan;
}

export type Preview = { createdAt: string | null; createdBy: string | null; warnings: string[]; tables: TableDiff[]; totals: { new: number; changed: number; unchanged: number; onlyInDatabase: number } };

export async function previewRestore(parsed: ParsedBackup): Promise<Preview> {
  const c = await pool.connect();
  try {
    const tables: TableDiff[] = [];
    for (const t of BACKUP_TABLES) { const p = await planTable(c, t, parsed.sheets[t.name]); if (p) tables.push(p.diff); }
    const sum = (f: (d: TableDiff) => number) => tables.reduce((a, d) => a + f(d), 0);
    return { createdAt: parsed.createdAt, createdBy: parsed.createdBy, warnings: parsed.warnings, tables, totals: { new: sum((d) => d.newCount), changed: sum((d) => d.changedCount), unchanged: sum((d) => d.unchanged), onlyInDatabase: sum((d) => d.onlyInDatabase) } };
  } finally { c.release(); }
}

// ───────────────────────────── apply ─────────────────────────────

export type ApplyResult = { tables: { table: string; inserted: number; updated: number; skipped: { key: string; reason: string }[]; skippedCount: number }[]; inserted: number; updated: number; skipped: number };

function friendly(e: any): string {
  switch (e?.code) {
    case '23503': return 'It points to a row that does not exist (for example its turf, user or booking is missing).';
    case '23505': return 'A value that must be unique is already used by another row.';
    case '23P01': return 'It overlaps a live booking on the same turf, so it was not restored.';
    case '23514': return 'A value breaks a rule on that column.';
    case '23502': return 'A required value is empty.';
    case '22P02': case '22007': case '22008': return 'A value has the wrong format.';
    default: return String(e?.message || 'Could not be written.').slice(0, 160);
  }
}

export async function applyRestore(parsed: ParsedBackup, only?: string[]): Promise<ApplyResult> {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    const out: ApplyResult = { tables: [], inserted: 0, updated: 0, skipped: 0 };
    for (const t of BACKUP_TABLES) {
      if (only && !only.includes(t.name)) continue;
      const plan = await planTable(c, t, parsed.sheets[t.name]);
      if (!plan || (!plan.inserts.length && !plan.updates.length)) continue;
      const res = { table: t.name, inserted: 0, updated: 0, skipped: [] as { key: string; reason: string }[], skippedCount: 0 };
      const skip = (row: Row, e: any) => { res.skippedCount++; if (res.skipped.length < SKIP_LIMIT) res.skipped.push({ key: t.pk.map((k) => String(row[k])).join(' / '), reason: friendly(e) }); };

      // each row in its own savepoint: one bad row is reported and skipped, the rest still restore
      for (const row of plan.inserts) {
        const cols = plan.shared;
        await c.query('SAVEPOINT r');
        try {
          await c.query(`INSERT INTO ${qi(t.name)} (${cols.map((x) => qi(x.name)).join(', ')}) VALUES (${cols.map((x, i) => `$${i + 1}::${x.cast}`).join(', ')})`, cols.map((x) => toParam(x, row[x.name])));
          await c.query('RELEASE SAVEPOINT r'); res.inserted++;
        } catch (e) { await c.query('ROLLBACK TO SAVEPOINT r'); skip(row, e); }
      }
      for (const { row, changed } of plan.updates) {
        const set = plan.shared.filter((x) => changed.includes(x.name));
        const where = t.pk.map((k) => plan.shared.find((x) => x.name === k)!);
        await c.query('SAVEPOINT r');
        try {
          await c.query(
            `UPDATE ${qi(t.name)} SET ${set.map((x, i) => `${qi(x.name)}=$${i + 1}::${x.cast}`).join(', ')} WHERE ${where.map((x, i) => `${qi(x.name)}=$${set.length + i + 1}::${x.cast}`).join(' AND ')}`,
            [...set.map((x) => toParam(x, row[x.name])), ...where.map((x) => toParam(x, row[x.name]))],
          );
          await c.query('RELEASE SAVEPOINT r'); res.updated++;
        } catch (e) { await c.query('ROLLBACK TO SAVEPOINT r'); skip(row, e); }
      }

      out.tables.push(res);
      out.inserted += res.inserted; out.updated += res.updated; out.skipped += res.skippedCount;
    }

    // Rows were inserted with explicit ids, so make sure serial sequences are past the highest id
    // (new rows must never collide). Done for every serial table, and never moves a sequence backwards.
    for (const t of BACKUP_TABLES) {
      if (t.pk.length !== 1) continue;
      const { rows: [s] } = await c.query('SELECT pg_get_serial_sequence($1,$2) AS seq', [t.name, t.pk[0]]);
      if (!s?.seq) continue;
      await c.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(${qi(t.pk[0])}),1) FROM ${qi(t.name)}), (SELECT last_value FROM ${s.seq})))`, [s.seq]);
    }
    return out;
  });
}

/** Tables in the database that this backup does not cover (so the admin page can warn). */
export async function unregisteredTables(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  const known = new Set(BACKUP_TABLES.map((t) => t.name));
  return rows.map((r: any) => r.table_name as string).filter((n) => !known.has(n));
}

export async function liveCounts(): Promise<{ table: string; rows: number }[]> {
  const out: { table: string; rows: number }[] = [];
  for (const t of BACKUP_TABLES) {
    try { const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${qi(t.name)}`); out.push({ table: t.name, rows: rows[0].n }); } catch {}
  }
  return out;
}
