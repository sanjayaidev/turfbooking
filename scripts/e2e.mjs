// End-to-end checks against a running server:  BASE=http://localhost:3100 node scripts/e2e.mjs
import pg from 'pg';
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, failN = 0;
const ok = (c, m) => { c ? pass++ : failN++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };

class Client {
  constructor() { this.cookie = ''; }
  async req(path, opts = {}) {
    const r = await fetch(BASE + path, { redirect: 'manual', ...opts, headers: { 'Content-Type': 'application/json', cookie: this.cookie, ...(opts.headers || {}) } });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const [kv] = c.split(';'); if (kv.endsWith('=')) this.cookie = ''; else this.cookie = kv; }
    let j = null; try { j = await r.clone().json(); } catch {}
    return { status: r.status, j, r };
  }
  post(path, body) { return this.req(path, { method: 'POST', body: JSON.stringify(body || {}) }); }
}
const istDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const suffix = Math.random().toString(36).slice(2, 7);
const date = addDays(istDate(), 20); // far in the future, free of seed bookings

const admin = new Client(), staff = new Client(), a = new Client(), b = new Client();

// --- auth
ok((await admin.post('/api/auth/login', { email: 'admin@turfbooking.demo', password: 'wrong' })).status === 401, 'wrong password rejected');
ok((await admin.post('/api/auth/login', { email: 'admin@turfbooking.demo', password: 'Admin@123' })).j.role === 'admin', 'admin login');
ok((await staff.post('/api/auth/login', { email: 'staff@turfbooking.demo', password: 'Staff@123' })).j.role === 'staff', 'staff login');
const reg = await a.post('/api/auth/register', { name: 'Test Alpha', phone: '9812345678', email: `alpha${suffix}@example.com`, password: 'password123' });
ok(reg.j.ok, 'customer A registers');
ok((await b.post('/api/auth/register', { name: 'Test Beta', phone: '9812345679', email: `beta${suffix}@example.com`, password: 'password123' })).j.ok, 'customer B registers');
ok(!(await a.post('/api/auth/register', { name: 'X', phone: '123', email: 'bad', password: '1' })).j.ok, 'invalid registration rejected');

// --- turf + slots
const slug = 'hirakud-premier-turf';
const turfId = (await admin.req('/api/slots?turfId=' + slug + '&date=' + date + '&duration=60')).j; // slug accepted by loadTurf
ok(turfId.ok && turfId.slots.length > 10, `slots returned for ${date} (${turfId.slots?.length})`);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const T = (await db.query("select id from turfs where slug=$1", [slug])).rows[0].id;
const slots = (await a.req(`/api/slots?turfId=${T}&date=${date}&duration=60`)).j.slots;
const free = slots.filter((s) => s.status === 'available');
ok(free.length === slots.length, 'all slots green on an empty future day');
ok(!(await a.req(`/api/slots?turfId=${T}&date=${date}&duration=45`)).j.slots.length, 'unsupported duration returns no slots');

// --- RACE: both customers try the same slot simultaneously
const start = 18 * 60;
const [r1, r2] = await Promise.all([
  a.post('/api/bookings/reserve', { turfId: T, date, startMin: start, duration: 60 }),
  b.post('/api/bookings/reserve', { turfId: T, date, startMin: start, duration: 60 }),
]);
const winners = [r1, r2].filter((r) => r.j.ok), losers = [r1, r2].filter((r) => !r.j.ok);
ok(winners.length === 1 && losers.length === 1, `race: exactly one reservation wins (got ${winners.length} winner)`);
ok(losers[0]?.status === 409 && /taken/i.test(losers[0].j.error), 'race loser gets a clear 409 message');
const winnerClient = r1.j.ok ? a : b, loserClient = r1.j.ok ? b : a;
const bookingId = winners[0].j.id;

// overlapping partial window must also be refused
const ov = await loserClient.post('/api/bookings/reserve', { turfId: T, date, startMin: start + 30, duration: 60 });
ok(!ov.j.ok && ov.status === 409, 'overlapping (staggered) slot refused');
const adj = await loserClient.post('/api/bookings/reserve', { turfId: T, date, startMin: start + 60, duration: 60 });
ok(adj.j.ok, 'consecutive (back-to-back) slot allowed');
const adjId = adj.j.id;

// yellow while held
const held = (await a.req(`/api/slots?turfId=${T}&date=${date}&duration=60`)).j.slots.find((s) => s.startMin === start);
ok(held.status === 'held', 'held slot shows yellow ("held")');

// --- failed payment keeps booking unconfirmed
const failPay = await winnerClient.post(`/api/bookings/${bookingId}/pay`, { outcome: 'fail', method: 'UPI' });
ok(failPay.j.status === 'failed', 'failed payment reported');
let row = (await db.query('select status,payment_status,ref from bookings where id=$1', [bookingId])).rows[0];
ok(row.status === 'reserved' && row.payment_status === 'failed' && !row.ref, 'failed payment: not confirmed, no reference, status FAILED');

// --- coupon (server-side)
const cp = await winnerClient.post(`/api/bookings/${bookingId}/coupon`, { code: 'WELCOME10' });
ok(cp.j.ok && cp.j.discount > 0 && cp.j.total > 0, `coupon applied server-side (discount ₹${cp.j.discount}, total ₹${cp.j.total})`);
ok(!(await winnerClient.post(`/api/bookings/${bookingId}/coupon`, { code: 'NOPE' })).j.ok, 'invalid coupon rejected');

// --- another user cannot touch my booking
ok((await loserClient.post(`/api/bookings/${bookingId}/pay`, { outcome: 'success' })).status === 404, "other customer cannot pay someone else's booking");

// --- success
const paid = await winnerClient.post(`/api/bookings/${bookingId}/pay`, { outcome: 'success', method: 'UPI' });
ok(paid.j.status === 'confirmed', 'successful payment confirms');
const paid2 = await winnerClient.post(`/api/bookings/${bookingId}/pay`, { outcome: 'success', method: 'UPI' });
ok(paid2.j.already === true, 'paying twice is idempotent');
row = (await db.query('select * from bookings where id=$1', [bookingId])).rows[0];
ok(/^SBL-CRT-\d{8}-\d{4}$/.test(row.ref), `reference ID format ok (${row.ref})`);
ok(row.status === 'confirmed' && row.payment_status === 'successful' && !!row.checkin_token, 'confirmed + paid + QR token');
const mails = (await db.query("select type,count(*)::int n from email_log where booking_id=$1 group by 1", [bookingId])).rows;
ok(mails.find((m) => m.type === 'booking_confirmed')?.n === 1, 'exactly one confirmation email');
ok(mails.some((m) => m.type === 'payment_failed'), 'payment-failed email generated');
const dupRefs = (await db.query('select count(*)::int n from (select ref from bookings where ref is not null group by ref having count(*)>1) x')).rows[0].n;
ok(dupRefs === 0, 'no duplicate reference IDs in database');

// --- slot expiry: force the other hold to be old, slot must free up
await db.query('update bookings set expires_at = now() - interval \'1 minute\' where id=$1', [adjId]);
const lateEx = await loserClient.post(`/api/bookings/${adjId}/pay`, { outcome: 'success', method: 'UPI' });
ok(!lateEx.j.ok && lateEx.status === 410, 'paying after the 10-minute hold is refused');
const after = (await a.req(`/api/slots?turfId=${T}&date=${date}&duration=60`)).j.slots.find((s) => s.startMin === start + 60);
ok(after.status === 'available', 'expired hold releases the slot (green again)');
row = (await db.query('select status from bookings where id=$1', [adjId])).rows[0];
ok(row.status === 'expired', 'expired booking marked expired');

// --- booking rules
ok(!(await a.post('/api/bookings/reserve', { turfId: T, date, startMin: 4 * 60, duration: 60 })).j.ok, 'outside operating hours refused');
ok(!(await a.post('/api/bookings/reserve', { turfId: T, date: addDays(istDate(), -1), startMin: 600, duration: 60 })).j.ok, 'past date refused');
ok(!(await a.post('/api/bookings/reserve', { turfId: T, date, startMin: 600, duration: 45 })).j.ok, 'invalid duration refused');
ok(!(await a.post('/api/bookings/reserve', { turfId: T, date, startMin: 615, duration: 60 })).j.ok, 'start not on slot interval refused');
const anon = new Client();
ok((await anon.post('/api/bookings/reserve', { turfId: T, date, startMin: 600, duration: 60 })).status === 401, 'reserving without login → 401');

// --- price tampering: server ignores any client price
const tamper = await a.post('/api/bookings/reserve', { turfId: T, date, startMin: 11 * 60, duration: 60, total: 1, price: 1, amount: 1 });
const tp = (await db.query('select total from bookings where id=$1', [tamper.j.id])).rows[0].total;
ok(tamper.j.ok && tp > 100, `client-sent price ignored (server charged ₹${tp})`);
await a.post(`/api/bookings/${tamper.j.id}/release`);

// --- block: admin blocks a slot → customers can't book
const blockStart = `${date}T08:00`, blockEnd = `${date}T10:00`;
await db.query("insert into blocks(turf_id,kind,start_ts,end_ts,reason) values ($1,'maintenance',$2,$3,'e2e')", [T, new Date(blockStart + ':00+05:30'), new Date(blockEnd + ':00+05:30')]);
const bs = (await a.req(`/api/slots?turfId=${T}&date=${date}&duration=60`)).j.slots;
ok(bs.find((s) => s.startMin === 8 * 60).status === 'blocked' && bs.find((s) => s.startMin === 9 * 60).status === 'blocked' && bs.find((s) => s.startMin === 10 * 60).status === 'available', 'blocked period shows grey; edges correct');
ok(!(await a.post('/api/bookings/reserve', { turfId: T, date, startMin: 8 * 60 + 30, duration: 60 })).j.ok, 'blocked slot cannot be reserved');
await db.query("delete from blocks where reason='e2e'");

// --- cancellation policy: disabled by default → customer cannot self-cancel
const c1 = await winnerClient.post(`/api/bookings/${bookingId}/cancel`, {});
ok(c1.status === 403, 'customer cancel blocked while policy is OFF (default)');
await db.query("update settings set value = '{\"enabled\":true,\"rules\":[{\"hoursBefore\":24,\"refundPercent\":100},{\"hoursBefore\":6,\"refundPercent\":50}]}' where key='cancellation'");
const c2 = await winnerClient.post(`/api/bookings/${bookingId}/cancel`, {});
row = (await db.query('select status,payment_status,refund_amount,total from bookings where id=$1', [bookingId])).rows[0];
ok(c2.j.ok && row.status === 'cancelled' && row.refund_amount === row.total && row.payment_status === 'refunded', `policy ON: >24h cancel → 100% refund (₹${row.refund_amount}) + status refunded`);
await db.query("update settings set value = '{\"enabled\":false,\"rules\":[]}' where key='cancellation'");
const freed = (await a.req(`/api/slots?turfId=${T}&date=${date}&duration=60`)).j.slots.find((s) => s.startMin === start);
ok(freed.status === 'available', 'cancelled booking frees the slot');
ok((await db.query("select count(*)::int n from email_log where booking_id=$1 and type='booking_cancelled'", [bookingId])).rows[0].n === 1, 'cancellation email generated');

// --- admin manual booking + RBAC
const man = await admin.post('/api/admin/bookings', { turfId: T, date, startMin: 12 * 60, duration: 90, name: 'Walk In', phone: '9000000001', payment: 'paid', method: 'Cash' });
ok(man.j.ok, 'admin creates manual booking');
const mrow = (await db.query('select status,payment_status,ref from bookings where id=$1', [man.j.id])).rows[0];
ok(mrow.status === 'confirmed' && mrow.ref, 'manual booking confirmed with reference');
ok(!(await admin.post('/api/admin/bookings', { turfId: T, date, startMin: 12 * 60 + 30, duration: 60, name: 'Dup', phone: '9000000002' })).j.ok, 'manual booking cannot overlap an existing one');
ok((await staff.post('/api/admin/bookings', { turfId: T, date, startMin: 15 * 60, duration: 60, name: 'Staff Walkin', phone: '9000000003' })).j.ok, 'staff WITH permission can create manual booking');
ok((await a.post('/api/admin/bookings', { turfId: T, date, startMin: 16 * 60, duration: 60, name: 'x', phone: '9000000004' })).status === 403, 'customer blocked from admin API');
ok((await anon.post('/api/admin/bookings', {})).status === 401, 'anonymous blocked from admin API');
const exp = await staff.req('/api/admin/export');
ok(exp.status === 403, 'staff WITHOUT export permission gets 403 on CSV export');
const exp2 = await admin.req('/api/admin/export?status=confirmed');
ok(exp2.status === 200 && (await exp2.r.text()).split('\n')[0].includes('Reference'), 'admin CSV export works');
ok((await a.req('/admin')).status === 307, 'customer is redirected away from /admin pages');
ok((await staff.req('/admin/staff')).status === 307, 'staff redirected away from admin-only page');
ok((await staff.req('/admin/bookings')).status === 200, 'staff can open permitted page');
ok((await admin.req('/admin/staff')).status === 200 && (await admin.req('/admin/settings')).status === 200 && (await admin.req('/admin/calendar')).status === 200 && (await admin.req('/admin')).status === 200, 'admin pages render');

// --- QR check-in
const tok = (await db.query('select checkin_token from bookings where id=$1', [man.j.id])).rows[0].checkin_token;
const ci1 = await admin.post('/api/admin/checkin', { token: tok });
ok(ci1.j.result === 'ok', 'QR check-in succeeds');
ok((await admin.post('/api/admin/checkin', { token: tok })).j.result === 'already', 'second scan reports already checked in');
ok((await admin.post('/api/admin/checkin', { token: 'bogus' })).j.result === 'invalid', 'invalid token handled');
ok((await a.post('/api/admin/checkin', { token: tok })).status === 403, 'customer cannot use check-in API');

// --- DB-level guarantee, bypassing the app entirely
let dbBlocked = false;
try {
  await db.query("insert into bookings(turf_id,customer_name,customer_phone,start_ts,end_ts,duration_min,status) select turf_id,'raw','1',start_ts+interval '10 minutes',end_ts,50,'confirmed' from bookings where id=$1", [man.j.id]);
} catch (e) { dbBlocked = e.code === '23P01'; }
ok(dbBlocked, 'Postgres EXCLUDE constraint rejects an overlapping raw INSERT');

// --- 30 concurrent requests for one slot
const crowd = Array.from({ length: 8 }, () => new Client());
const day2 = addDays(date, 1);
await Promise.all(crowd.map((c, i) => c.post('/api/auth/register', { name: 'Crowd ' + i, phone: '98123456' + (10 + i), email: `crowd${i}_${suffix}@example.com`, password: 'password123' })));
const res = await Promise.all(crowd.map((c) => c.post('/api/bookings/reserve', { turfId: T, date: day2, startMin: 19 * 60, duration: 60 })));
ok(res.filter((r) => r.j.ok).length === 1, `8 simultaneous customers, 1 slot → exactly 1 succeeds (${res.filter((r) => r.j.ok).length})`);

// --- pages
for (const p of ['/', '/turfs', `/turfs/${slug}`, '/login', '/register', '/track?ref=SBL-CRT-0&phone=9812345678']) ok((await fetch(BASE + p)).status === 200, `GET ${p} 200`);
ok((await fetch(BASE + '/turfs/nope')).status === 404, 'unknown turf → 404');

await db.query("delete from users where email like $1", [`%${suffix}@example.com`]);
await db.end();
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
