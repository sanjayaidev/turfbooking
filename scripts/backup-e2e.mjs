// Backup & delta-restore checks against a running server:
//   BASE=http://localhost:3100 DATABASE_URL=... node scripts/backup-e2e.mjs
// Uses the seeded demo data (npm run db:reset) and cleans up the rows it adds.
import pg from 'pg';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, failN = 0;
const ok = (c, m) => { c ? pass++ : failN++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
const TABLES = ['users', 'turfs', 'operating_hours', 'pricing_rules', 'blocks', 'coupons', 'ref_counters', 'bookings', 'payments', 'email_log', 'audit_logs', 'settings'];

class Client {
  constructor() { this.cookie = ''; }
  async login(email, password) {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); if (!kv.endsWith('=')) this.cookie = kv; }
    return (await r.json()).role;
  }
  async download() {
    const r = await fetch(BASE + '/api/admin/backup', { headers: { cookie: this.cookie } });
    return { status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), bytes: Buffer.from(await r.arrayBuffer()) };
  }
  async restore(bytes, mode, tables = [], name = 'backup.xlsx') {
    const fd = new FormData();
    if (bytes) fd.set('file', new Blob([bytes]), name);
    fd.set('mode', mode);
    tables.forEach((t) => fd.append('tables', t));
    const r = await fetch(BASE + '/api/admin/backup/restore', { method: 'POST', headers: { cookie: this.cookie }, body: fd });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = (t, p) => db.query(t, p);
const snap = async (table, where = 'true') => JSON.stringify((await q(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS s FROM ${table} t WHERE ${where}`)).rows[0].s);
const by = (preview) => Object.fromEntries(preview.tables.map((t) => [t.table, t]));

const admin = new Client(), staff = new Client();
ok((await admin.login('admin@turfbooking.demo', 'Admin@123')) === 'admin', 'admin login');
ok((await staff.login('staff@turfbooking.demo', 'Staff@123')) === 'staff', 'staff login');

// ── access control
ok((await fetch(BASE + '/api/admin/backup')).status === 401, 'download needs sign-in');
ok((await staff.download()).status === 403, 'staff cannot download a backup');
ok((await staff.restore(Buffer.from('PK\u0003\u0004'), 'preview')).status === 403, 'staff cannot restore');
const pg403 = await fetch(BASE + '/admin/backup', { headers: { cookie: staff.cookie }, redirect: 'manual' });
ok([307, 302].includes(pg403.status) && (pg403.headers.get('location') || '').includes('/admin/forbidden'), 'staff is redirected away from the page');

// ── baseline data: two future bookings, a very long email body, some audit rows
const futures = (await q("SELECT * FROM bookings WHERE status='confirmed' AND start_ts > now() + interval '1 day' ORDER BY start_ts LIMIT 2")).rows;
const [X, Z] = futures;
ok(!!X && !!Z, 'demo data has two future confirmed bookings');
const longBody = '<p>long body line</p>'.repeat(4000); // ~84 000 chars, over Excel's 32 767 limit per cell
const longId = (await q("INSERT INTO email_log(booking_id,type,to_email,subject,body_html) VALUES ($1,'test','a@b.c','long',$2) RETURNING id", [Z.id, longBody])).rows[0].id;
for (let i = 0; i < 5; i++) await q("INSERT INTO audit_logs(user_name,action,entity,details) VALUES ('e2e','test.row','x',$1)", [{ n: i, text: 'héllo, "quoted" / 日本語' }]);

// ── download
const F = await admin.download();
ok(F.status === 200 && (F.type || '').includes('spreadsheetml'), 'admin downloads an .xlsx');
ok(/turfbooking-backup-\d{4}-\d\d-\d\d-\d{4}\.xlsx/.test(F.disposition || ''), 'file name carries date and time');
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(F.bytes);
ok(['_backup_info', ...TABLES].every((n) => wb.getWorksheet(n)), 'one sheet per table plus an info sheet');
let countsMatch = true;
for (const t of TABLES) {
  const live = (await q(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  const rows = wb.getWorksheet(t).rowCount - 1;
  if (t !== 'audit_logs' && rows !== live) countsMatch = false; // audit_logs gains a row for the download itself
}
ok(countsMatch, 'sheet row counts equal table row counts');
ok(JSON.stringify(wb.getWorksheet('users').getRow(1).values).includes('password_hash'), 'users sheet includes password_hash for a faithful restore');
const S0 = {};
for (const t of TABLES.filter((t) => t !== 'audit_logs')) S0[t] = await snap(t);
S0.audit = await snap('audit_logs', "action = 'test.row'");

// ── round trip: restoring a fresh backup is an empty delta
const rt = await admin.restore(F.bytes, 'preview');
ok(rt.status === 200 && rt.j.ok, 'preview of an unchanged backup works');
const rtp = rt.j.preview;
ok(rtp.totals.new === 0 && rtp.totals.changed === 0, 'unchanged backup: 0 new, 0 changed (timestamps, JSON, arrays round-trip exactly)');
ok(rtp.totals.unchanged > 300, `identical rows are counted (${rtp.totals.unchanged})`);
ok(rtp.tables.every((t) => t.invalid.length === 0), 'no unreadable rows');
const live1 = rtp.tables.filter((t) => t.onlyInDatabase > 0).map((t) => t.table);
ok(live1.length === 1 && live1[0] === 'audit_logs', 'only the download\'s own audit row exists outside the file');

// ── change the database: deletions, edits, one live-only row
const victimUser = (await q('SELECT user_id FROM bookings WHERE user_id IS NOT NULL AND id NOT IN ($1,$2) LIMIT 1', [X.id, Z.id])).rows[0].user_id;
await q('DELETE FROM bookings WHERE id=$1', [X.id]);                                   // + its payments / emails (cascade)
await q('DELETE FROM email_log WHERE id=$1', [longId]);
await q("UPDATE turfs SET name='Renamed Turf', weekday_rate=999.5 WHERE id=$1", [Z.turf_id]);
await q("UPDATE bookings SET total=1, notes='tampered' WHERE id=$1", [Z.id]);
await q("UPDATE coupons SET used_count=7 WHERE code='WELCOME10'");
await q(`UPDATE settings SET value = jsonb_set(value,'{name}','"Hacked"') WHERE key='business'`);
await q('DELETE FROM users WHERE id=$1', [victimUser]);                                // bookings.user_id etc. become NULL
await q("UPDATE users SET password_hash='$2a$10$tamperedtamperedtamperedtamperedtamperedtamper' WHERE email='staff@turfbooking.demo'");
await q("INSERT INTO coupons(code,discount_type,value) VALUES ('LIVEONLY','flat',50)");
await q("DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs WHERE action='test.row' ORDER BY id DESC LIMIT 3)");
await q("SELECT setval(pg_get_serial_sequence('audit_logs','id'), 1)"); // sequence far behind the restored ids

const pv = await admin.restore(F.bytes, 'preview');
const P = by(pv.j.preview);
ok(P.bookings.newCount === 1 && P.payments.newCount >= 1, 'deleted booking and its payments show as new');
ok(P.email_log.newCount >= 1, 'deleted long email shows as new');
ok(P.users.newCount === 1, 'deleted user shows as new');
ok(P.turfs.changedCount === 1 && P.turfs.samples.changed[0].changes.some((c) => c.column === 'name' && c.from === 'Renamed Turf'), 'edited turf shows old → new value');
ok(P.bookings.changedCount >= 1, 'edited booking (and orphaned user_id) show as changed');
ok(P.coupons.changedCount === 1 && P.coupons.onlyInDatabase === 1, 'coupon edit is changed; LIVEONLY is reported as only-in-database');
ok(P.settings.changedCount === 1, 'edited setting shows as changed');
ok(P.audit_logs.newCount === 3, 'deleted audit rows show as new');
ok(P.users.changedCount === 1, 'password hash change shows as changed');
ok(!/\$2[aby]\$/.test(JSON.stringify(pv.j)), 'preview never exposes password hashes');
ok(P.operating_hours.newCount === 0 && P.pricing_rules.changedCount === 0, 'untouched tables show nothing');

// ── apply only some tables first
const part = await admin.restore(F.bytes, 'apply', ['coupons']);
ok(part.status === 200 && part.j.result.updated === 1 && part.j.result.inserted === 0, 'applying one table writes only that table (and the audit entry still works with a lagging sequence)');
const auditsBefore = (await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='backup.restore'")).rows[0].n;
ok((await q("SELECT name FROM turfs WHERE id=$1", [Z.turf_id])).rows[0].name === 'Renamed Turf', 'other tables untouched by a partial apply');
ok((await admin.restore(F.bytes, 'apply', [])).status === 400, 'apply with no tables is rejected');

// ── apply everything
const ap = await admin.restore(F.bytes, 'apply', TABLES);
ok(ap.status === 200 && ap.j.ok, 'full apply succeeds (audit write after a behind sequence works)');
ok(ap.j.result.skipped === 0, `nothing skipped (${ap.j.result.skipped})`);
ok((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='backup.restore'")).rows[0].n === auditsBefore + 1, 'restore is written to the audit log');
let same = true;
for (const t of TABLES.filter((t) => t !== 'audit_logs')) {
  const now = t === 'coupons' ? await snap('coupons', "code <> 'LIVEONLY'") : await snap(t);
  const was = t === 'coupons' ? JSON.stringify(JSON.parse(S0.coupons)) : S0[t];
  if (now !== was) { same = false; console.log('   differs:', t); }
}
ok(same, 'every table equals the backup again (microsecond timestamps, numerics, arrays, JSON)');
ok(await snap('audit_logs', "action = 'test.row'") === S0.audit, 'audit rows restored exactly');
ok((await q("SELECT 1 FROM coupons WHERE code='LIVEONLY'")).rowCount === 1, 'rows that only exist in the database are NOT deleted');
const back = (await q('SELECT body_html FROM email_log WHERE id=$1', [longId])).rows[0]?.body_html || '';
ok(back.length === longBody.length && crypto.createHash('md5').update(back).digest('hex') === crypto.createHash('md5').update(longBody).digest('hex'), 'text longer than one Excel cell restores byte for byte');
const again = by((await admin.restore(F.bytes, 'preview')).j.preview);
ok(Object.values(again).every((t) => t.newCount === 0 && t.changedCount === 0), 'second preview is an empty delta');
ok((await admin.restore(F.bytes, 'apply', TABLES)).j.result.inserted === 0, 'applying twice changes nothing (idempotent)');

// ── conflict: slot taken by a different booking while X is missing
await q('DELETE FROM bookings WHERE id=$1', [X.id]);
const Y = (await q(`INSERT INTO bookings(turf_id,customer_name,customer_phone,start_ts,end_ts,duration_min,status,payment_status)
  VALUES ($1,'Squatter','9999999999',$2,$3,$4,'confirmed','successful') RETURNING id`, [X.turf_id, X.start_ts, X.end_ts, X.duration_min])).rows[0].id;
const cf = await admin.restore(F.bytes, 'apply', TABLES);
const cb = cf.j.result.tables.find((t) => t.table === 'bookings');
ok(cf.status === 200 && cb?.skippedCount === 1 && /overlaps/.test(cb.skipped[0].reason), 'overlapping live booking blocks only that row, with a clear reason');
ok(cf.j.result.tables.find((t) => t.table === 'payments')?.skippedCount >= 1, 'its payments are skipped too (parent missing), not crashed');
ok((await q('SELECT 1 FROM bookings WHERE id=$1', [Y])).rowCount === 1, 'the live booking is left intact');
await q('DELETE FROM bookings WHERE id=$1', [Y]);
const fix = await admin.restore(F.bytes, 'apply', TABLES);
ok(fix.j.result.skipped === 0 && (await snap('bookings')) === S0.bookings && (await snap('payments')) === S0.payments, 'once the slot is free the booking and payments restore exactly');

// ── a hand-edited workbook
const ed = new ExcelJS.Workbook(); await ed.xlsx.load(F.bytes);
const hdr = (ws) => Object.fromEntries(ws.getRow(1).values.map((v, i) => [v, i]).filter(([v]) => v));
const turfWs = ed.getWorksheet('turfs'), th = hdr(turfWs);
const editedTurfId = turfWs.getRow(2).getCell(th.id).value;
turfWs.getRow(2).getCell(th.name).value = 'Edited In Excel';
const coupWs = ed.getWorksheet('coupons'), ch = hdr(coupWs);
const newRow = []; newRow[ch.id] = crypto.randomUUID(); newRow[ch.code] = 'EDITED5'; newRow[ch.discount_type] = 'flat'; newRow[ch.value] = 5; newRow[ch.min_amount] = 0; newRow[ch.used_count] = 0; newRow[ch.active] = true; newRow[ch.created_at] = '2026-01-01T00:00:00.000000Z';
coupWs.addRow(newRow.slice(1));
const bookWs = ed.getWorksheet('bookings'); bookWs.getRow(2).getCell(hdr(bookWs).total).value = 'abc';
const EB = Buffer.from(await ed.xlsx.writeBuffer());
const ep = by((await admin.restore(EB, 'preview')).j.preview);
ok(ep.turfs.changedCount === 1 && ep.coupons.newCount === 1 && ep.bookings.invalid.length === 1, 'edited workbook: 1 changed turf, 1 added coupon, 1 unreadable row reported');
ok(/not a number/.test(ep.bookings.invalid[0].reason) && ep.bookings.invalid[0].line === 2, 'unreadable row names the line and the problem');
const ea = await admin.restore(EB, 'apply', ['turfs', 'coupons', 'bookings']);
ok(ea.status === 200 && (await q('SELECT name FROM turfs WHERE id=$1', [editedTurfId])).rows[0].name === 'Edited In Excel' && (await q("SELECT 1 FROM coupons WHERE code='EDITED5'")).rowCount === 1, 'edits made in Excel are applied');
ok((await snap('bookings')) === S0.bookings, 'the unreadable row was skipped and nothing else in bookings changed');

// ── bad uploads
ok((await admin.restore(null, 'preview')).status === 400, 'no file is rejected');
ok((await admin.restore(Buffer.from('hello,world\n1,2'), 'preview', [], 'x.xlsx')).status === 400, 'a non-Excel file is rejected');
const blank = new ExcelJS.Workbook(); blank.addWorksheet('Sheet1').addRow(['a']);
const bl = await admin.restore(Buffer.from(await blank.xlsx.writeBuffer()), 'preview');
ok(bl.status === 400 && /not a TurfBooking backup/.test(bl.j.error), 'a random workbook is rejected with a clear message');
const partial = new ExcelJS.Workbook(); await partial.xlsx.load(F.bytes); partial.removeWorksheet(partial.getWorksheet('coupons').id);
const pp = await admin.restore(Buffer.from(await partial.xlsx.writeBuffer()), 'preview');
ok(pp.status === 200 && pp.j.preview.warnings.some((w) => /coupons/.test(w)) && !pp.j.preview.tables.some((t) => t.table === 'coupons'), 'a missing sheet is a warning and that table is left alone');

// ── page renders
const page = await fetch(BASE + '/admin/backup', { headers: { cookie: admin.cookie } });
const html = await page.text();
ok(page.status === 200 && html.includes('Download backup') && html.includes('Restore from a backup'), 'admin page renders');

// ── cleanup
await q("DELETE FROM coupons WHERE code IN ('LIVEONLY','EDITED5')");
await q("DELETE FROM email_log WHERE id=$1", [longId]);
await q("DELETE FROM audit_logs WHERE action IN ('test.row','backup.restore','backup.download')");
await q("UPDATE turfs SET name=$2 WHERE id=$1", [editedTurfId, JSON.parse(S0.turfs).find((t) => t.id === editedTurfId).name]);
await db.end();
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
