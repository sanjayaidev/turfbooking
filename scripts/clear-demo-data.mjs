// Removes the demo data loaded by SEED_DEMO=true / `npm run db:seed`, and keeps every admin account.
//
//   Dry run (changes nothing):  DATABASE_URL=... node scripts/clear-demo-data.mjs
//   Apply for real:             DATABASE_URL=... node scripts/clear-demo-data.mjs --yes
//
// (add DATABASE_SSL=true when connecting to Railway through its public URL)
//
// It only touches the exact rows scripts/migrate.mjs seeds: 3 demo turfs, 3 demo coupons, the
// staff + customer demo accounts, and the bookings made by those demo accounts. Anything created
// by real users or by you in the admin console is left alone. Admin accounts are never deleted.
// Everything runs in ONE transaction: a dry run does the same deletes and then rolls back, so
// the counts it prints are exactly what --yes will do.
import pg from 'pg';
import bcrypt from 'bcryptjs';

const apply = process.argv.includes('--yes');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// ---- exactly what seedDemo() in scripts/migrate.mjs inserts -------------------------------
const DEMO_CUSTOMER_NAMES = ['Aditya Nayak', 'Priyanka Sahu', 'Rohit Panda', 'Sneha Mohanty', 'Abhijit Behera', 'Debasis Pradhan', 'Smita Rath', 'Manoj Dash', 'Ankita Sethi', 'Subham Naik', 'Ritesh Agrawal', 'Pooja Mishra'];
const DEMO_EMAILS = [
  'staff@turfbooking.demo',
  'demo@turfbooking.demo',
  ...DEMO_CUSTOMER_NAMES.map((n) => n.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com'),
];
const DEMO_TURF_SLUGS = ['hirakud-premier-turf', 'burla-box-cricket-arena', 'ainthapali-practice-grounds'];
const DEMO_COUPONS = ['WELCOME10', 'FLAT100', 'WEEKEND15'];
// -------------------------------------------------------------------------------------------

const count = async (sql, params) => (await client.query(sql, params)).rows[0].c;

async function main() {
  await client.connect();
  const u = new URL(url);
  console.log(`Database: ${u.hostname}:${u.port || 5432}${u.pathname}`);
  console.log(apply ? 'Mode:     APPLY (changes will be committed)\n' : 'Mode:     DRY RUN (nothing is changed; add --yes to apply)\n');

  await client.query('BEGIN');
  try {
    const admins = (await client.query("SELECT email, password_hash FROM users WHERE role = 'admin' AND active")).rows;
    if (!admins.length) throw new Error('No active admin account exists. Aborting so you are not locked out. Run `node scripts/migrate.mjs` (with ADMIN_EMAIL / ADMIN_PASSWORD set) first.');

    // 1) bookings made by demo accounts (their payments and email_log rows go with them)
    const demoUserIds = (await client.query("SELECT id FROM users WHERE role <> 'admin' AND email = ANY($1)", [DEMO_EMAILS])).rows.map((r) => r.id);
    const bookingIds = (await client.query('SELECT id FROM bookings WHERE user_id = ANY($1)', [demoUserIds])).rows.map((r) => r.id);
    const payments = await count('SELECT count(*)::int AS c FROM payments WHERE booking_id = ANY($1)', [bookingIds]);
    const emails = await count('SELECT count(*)::int AS c FROM email_log WHERE booking_id = ANY($1)', [bookingIds]);
    await client.query('DELETE FROM bookings WHERE id = ANY($1)', [bookingIds]);

    // 2) demo users (never an admin, even if its email matches)
    const users = (await client.query("DELETE FROM users WHERE id = ANY($1) AND role <> 'admin'", [demoUserIds])).rowCount;

    // 3) demo coupons
    const coupons = (await client.query('DELETE FROM coupons WHERE code = ANY($1)', [DEMO_COUPONS])).rowCount;

    // 4) demo turfs (hours, pricing rules and blocks go with them). A turf that still has a booking
    //    from a real customer or from an admin is KEPT, because deleting it would destroy that booking.
    const turfs = (await client.query(
      'DELETE FROM turfs t WHERE t.slug = ANY($1) AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.turf_id = t.id) RETURNING t.slug',
      [DEMO_TURF_SLUGS])).rows.map((r) => r.slug);
    const keptTurfs = (await client.query(
      'SELECT t.slug, count(b.id)::int AS bookings FROM turfs t JOIN bookings b ON b.turf_id = t.id WHERE t.slug = ANY($1) GROUP BY t.slug',
      [DEMO_TURF_SLUGS])).rows;

    // 5) booking-reference counters only matter while bookings exist
    const bookingsLeft = await count('SELECT count(*)::int AS c FROM bookings');
    if (bookingsLeft === 0) await client.query('DELETE FROM ref_counters');

    console.log(apply ? 'Deleted:' : 'Would delete:');
    console.log(`  bookings          ${bookingIds.length}`);
    console.log(`  payments/refunds  ${payments}`);
    console.log(`  email log rows    ${emails}`);
    console.log(`  demo users        ${users}`);
    console.log(`  demo coupons      ${coupons}`);
    console.log(`  demo turfs        ${turfs.length}${turfs.length ? '  (' + turfs.join(', ') + ')' : ''}`);
    for (const k of keptTurfs) console.log(`  KEPT turf ${k.slug}: still has ${k.bookings} booking(s) that are not demo data. Cancel/delete those yourself, then re-run.`);

    const left = {
      admins: admins.length,
      otherUsers: await count("SELECT count(*)::int AS c FROM users WHERE role <> 'admin'"),
      turfs: await count('SELECT count(*)::int AS c FROM turfs'),
      bookings: bookingsLeft,
    };
    console.log(`\n${apply ? 'Left in database:' : 'Would be left:'} ${left.admins} admin, ${left.otherUsers} other user(s), ${left.turfs} turf(s), ${left.bookings} booking(s)`);

    const weak = [];
    for (const a of admins) if (await bcrypt.compare('Admin@123', a.password_hash)) weak.push(a.email);
    if (weak.length) console.log(`\nWARNING: ${weak.join(', ')} still uses the demo password "Admin@123" from the README. Change it in Admin > Staff before going live.`);

    if (apply) { await client.query('COMMIT'); console.log('\nDone. Committed.'); }
    else { await client.query('ROLLBACK'); console.log('\nDry run only. Nothing was changed. Re-run with --yes to apply.'); }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('\nFailed, nothing was changed:', e.message); process.exit(1); });
