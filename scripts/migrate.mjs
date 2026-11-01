// Runs on every start: applies the schema (idempotent), makes sure an admin exists,
// and optionally loads demo data. Usage: node scripts/migrate.mjs [--seed] [--reset]
import pg from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const forceSeed = args.includes('--seed');
const reset = args.includes('--reset');

pg.types.setTypeParser(1700, parseFloat);
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const IST = '+05:30';
const istDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tsOf = (date, min) => new Date(new Date(`${date}T00:00:00${IST}`).getTime() + min * 60000);
const dowOf = (date) => new Date(date + 'T00:00:00Z').getUTCDay();

// small deterministic PRNG so the demo data is the same every time
let s = 20261101;
const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

async function main() {
  await client.connect();
  if (reset) {
    console.log('Resetting database…');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await client.query(schema);
  console.log('Schema ready.');

  // default settings (never overwrite what the admin already changed)
  const defaults = {
    business: {
      name: 'TurfBooking',
      tagline: 'Book premium cricket turfs in Sambalpur in under a minute.',
      phone: '+91 98765 43210',
      email: 'hello@turfbooking.demo',
      address: 'Sambalpur, Odisha, India',
      whatsapp: '919876543210',
    },
    cancellation: { enabled: false, rules: [] },
    booking: { lockMinutes: 10, windowDays: 60, minLeadMinutes: 30 },
  };
  for (const [k, v] of Object.entries(defaults)) {
    await client.query('INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }

  const { rows: [{ count: userCount }] } = await client.query('SELECT count(*)::int AS count FROM users');
  const wantSeed = forceSeed || (process.env.SEED_DEMO === 'true' && userCount === 0);
  if (wantSeed) await seedDemo();

  const { rows: admins } = await client.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
  if (!admins.length) {
    const email = (process.env.ADMIN_EMAIL || 'admin@turfbooking.demo').toLowerCase();
    const pw = process.env.ADMIN_PASSWORD || 'Admin@123';
    await client.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES ('Administrator',$1,$2,'admin') ON CONFLICT (email) DO NOTHING",
      [email, await bcrypt.hash(pw, 10)],
    );
    console.log(`Created admin ${email}`);
  }
  await client.end();
  console.log('Database ready.');
}

async function seedDemo() {
  console.log('Seeding demo data…');
  const q = (t, p) => client.query(t, p);
  const hash = (p) => bcrypt.hashSync(p, 10);

  const adminId = (await q(
    `INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Sanjay Meher','admin@turfbooking.demo','9876543210',$1,'admin')
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [hash('Admin@123')])).rows[0].id;
  await q(
    `INSERT INTO users(name,email,phone,password_hash,role,permissions) VALUES ('Front Desk Staff','staff@turfbooking.demo','9876500001',$1,'staff',$2)
     ON CONFLICT (email) DO NOTHING`,
    [hash('Staff@123'), ['dashboard', 'bookings.view', 'bookings.create', 'checkin', 'blocks', 'customers.view']]);

  const names = ['Aditya Nayak', 'Priyanka Sahu', 'Rohit Panda', 'Sneha Mohanty', 'Abhijit Behera', 'Debasis Pradhan', 'Smita Rath', 'Manoj Dash', 'Ankita Sethi', 'Subham Naik', 'Ritesh Agrawal', 'Pooja Mishra'];
  const customers = [];
  const demoCustomer = (await q(
    `INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Demo Customer','demo@turfbooking.demo','9090909090',$1,'customer')
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id,name,email,phone`, [hash('Customer@123')])).rows[0];
  customers.push(demoCustomer);
  const cpw = hash('Customer@123');
  for (let i = 0; i < names.length; i++) {
    const email = names[i].toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com';
    const phone = '9' + String(800000000 + i * 7919311).slice(0, 9);
    const r = await q(
      `INSERT INTO users(name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,'customer')
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id,name,email,phone`, [names[i], email, phone, cpw]);
    customers.push(r.rows[0]);
  }

  const turfDefs = [
    {
      slug: 'hirakud-premier-turf', name: 'Hirakud Premier Turf', sport: 'Cricket',
      tagline: 'Full-size match turf with floodlights',
      description: 'Our flagship ground: a professionally rolled, full-length turf pitch with bright LED floodlights, a covered pavilion and a scoreboard. Ideal for 8–11 a-side matches, league games and corporate tournaments.',
      address: 'Hirakud Road, near Burla Bus Stand, Sambalpur, Odisha 768017', city: 'Sambalpur', map_query: 'Burla, Sambalpur, Odisha',
      phone: '+91 98765 43210', email: 'hirakud@turfbooking.demo',
      images: ['/img/turf-stripes.svg', '/img/turf-night.svg', '/img/turf-sunset.svg'],
      amenities: ['LED Floodlights', 'Pavilion & Seating', 'Parking', 'Drinking Water', 'Washrooms', 'Changing Rooms', 'Scoreboard', 'First-aid Kit'],
      durations: [60, 90, 120, 180], wk: 1800, we: 2400, promo: 0, promoLabel: null,
      hours: [[360, 1380], [360, 1380], [360, 1380], [360, 1380], [360, 1380], [360, 1440], [360, 1440]],
    },
    {
      slug: 'burla-box-cricket-arena', name: 'Burla Box Cricket Arena', sport: 'Box Cricket',
      tagline: 'Compact netted arena for fast 6-a-side games',
      description: 'A fully netted box-cricket arena with synthetic turf and shock-absorbing underlay. Perfect for quick evening games with friends, office teams and birthday parties.',
      address: 'VSS Nagar Main Road, Burla, Sambalpur, Odisha 768018', city: 'Sambalpur', map_query: 'VSS Nagar, Burla, Odisha',
      phone: '+91 98765 43211', email: 'burla@turfbooking.demo',
      images: ['/img/turf-nets.svg', '/img/turf-night.svg', '/img/turf-stripes.svg'],
      amenities: ['Fully Netted', 'LED Floodlights', 'Equipment Rental', 'Parking', 'Drinking Water', 'Cafeteria'],
      durations: [30, 60, 90, 120], wk: 1000, we: 1400, promo: 10, promoLabel: 'Launch offer: 10% off',
      hours: [[420, 1410], [420, 1410], [420, 1410], [420, 1410], [420, 1410], [420, 1440], [420, 1440]],
    },
    {
      slug: 'ainthapali-practice-grounds', name: 'Ainthapali Practice Grounds', sport: 'Cricket',
      tagline: 'Net sessions and coaching pitches',
      description: 'Six turf practice nets and two bowling machines for serious net sessions, academy training and fitness drills. Coaches available on request.',
      address: 'Ainthapali, Sambalpur, Odisha 768004', city: 'Sambalpur', map_query: 'Ainthapali, Sambalpur, Odisha',
      phone: '+91 98765 43212', email: 'ainthapali@turfbooking.demo',
      images: ['/img/turf-sunset.svg', '/img/turf-nets.svg', '/img/turf-stripes.svg'],
      amenities: ['Bowling Machines', 'Turf Practice Nets', 'Coaching Available', 'Drinking Water', 'Parking'],
      durations: [30, 60, 90], wk: 700, we: 900, promo: 0, promoLabel: null,
      hours: [[330, 1260], [330, 1260], [330, 1260], [330, 1260], [330, 1260], [330, 1260], [330, 1200]],
    },
  ];

  const turfs = [];
  for (let i = 0; i < turfDefs.length; i++) {
    const t = turfDefs[i];
    const r = await q(
      `INSERT INTO turfs(slug,name,tagline,description,sport,address,city,map_query,phone,email,images,amenities,slot_interval,durations,weekday_rate,weekend_rate,promo_percent,promo_label,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,30,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [t.slug, t.name, t.tagline, t.description, t.sport, t.address, t.city, t.map_query, t.phone, t.email, t.images, t.amenities, t.durations, t.wk, t.we, t.promo, t.promoLabel, i]);
    const id = r.rows[0].id;
    turfs.push({ ...t, id });
    for (let d = 0; d < 7; d++) {
      await q('INSERT INTO operating_hours(turf_id,dow,open_min,close_min) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, d, t.hours[d][0], t.hours[d][1]]);
    }
    // pricing rules: evening peak, morning off-peak, festival day
    await q(`INSERT INTO pricing_rules(turf_id,name,kind,days,start_min,end_min,rate) VALUES ($1,'Evening peak','peak','{1,2,3,4,5}',1080,1320,$2)`, [id, Math.round(t.wk * 1.25)]);
    await q(`INSERT INTO pricing_rules(turf_id,name,kind,days,start_min,end_min,rate) VALUES ($1,'Weekend evening peak','peak','{0,6}',1020,1320,$2)`, [id, Math.round(t.we * 1.2)]);
    await q(`INSERT INTO pricing_rules(turf_id,name,kind,days,start_min,end_min,rate) VALUES ($1,'Morning off-peak','offpeak','{1,2,3,4,5}',360,600,$2)`, [id, Math.round(t.wk * 0.75)]);
    await q(`INSERT INTO pricing_rules(turf_id,name,kind,date_from,date_to,start_min,end_min,rate) VALUES ($1,'Diwali special','holiday','2026-11-08','2026-11-08',0,1440,$2)`, [id, Math.round(t.we * 1.4)]);
  }

  // one maintenance window next week on the first turf
  await q(`INSERT INTO blocks(turf_id,kind,start_ts,end_ts,reason,created_by) VALUES ($1,'maintenance',$2,$3,'Pitch rolling & re-turfing',$4)`,
    [turfs[0].id, tsOf(addDays(istDate(), 4), 360), tsOf(addDays(istDate(), 4), 600), adminId]);

  await q(`INSERT INTO coupons(code,description,discount_type,value,max_discount,min_amount,valid_to) VALUES
    ('WELCOME10','10% off your booking (max ₹250)','percent',10,250,500,'2027-03-31'),
    ('FLAT100','₹100 off bookings above ₹800','flat',100,NULL,800,'2027-03-31'),
    ('WEEKEND15','15% off weekend bookings (max ₹400)','percent',15,400,1000,'2027-01-31')
    ON CONFLICT (code) DO NOTHING`);

  // ---- demo bookings -------------------------------------------------
  const today = istDate();
  const counters = {};
  const nextRef = async (createdDate) => {
    const key = createdDate;
    counters[key] = (counters[key] || 0) + 1;
    await q('INSERT INTO ref_counters(day,n) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET n = GREATEST(ref_counters.n, $2)', [createdDate, counters[key]]);
    return `SBL-CRT-${createdDate.replaceAll('-', '')}-${String(counters[key]).padStart(4, '0')}`;
  };
  const rand = (n) => Math.floor(rnd() * n);
  let made = 0;
  for (let off = -24; off <= 9; off++) {
    const date = addDays(today, off);
    const dow = dowOf(date);
    const nBookings = (dow === 0 || dow === 6 ? 5 : 3) + rand(3);
    for (let b = 0; b < nBookings; b++) {
      const turf = turfs[rand(3) === 2 ? 2 : rand(2)];
      const [open, close] = turf.hours[dow];
      const dur = pick(turf.durations.filter((d) => d <= 120));
      const startMin = open + 30 * rand(Math.max(1, Math.floor((close - open - dur) / 30) + 1));
      if (startMin + dur > close) continue;
      const peak = (dow >= 1 && dow <= 5 && startMin >= 1080 && startMin < 1320) || ((dow === 0 || dow === 6) && startMin >= 1020 && startMin < 1320);
      const base = dow === 0 || dow === 6 ? turf.we : turf.wk;
      const rate = peak ? Math.round(base * 1.25) : base;
      let subtotal = Math.round((rate * dur) / 60);
      let discount = Math.round(subtotal * (turf.promo / 100));
      const total = subtotal - discount;
      const cust = pick(customers);
      const start = tsOf(date, startMin);
      const end = new Date(start.getTime() + dur * 60000);
      const createdDate = istDate(new Date(start.getTime() - (1 + rand(5)) * 86400000));
      const roll = rnd();
      const isPast = end < new Date();
      let status = 'confirmed', pay = 'successful', refund = 0, cancelledAt = null, reason = null;
      if (roll > 0.9) { status = 'cancelled'; pay = rnd() > 0.5 ? 'refunded' : 'partially_refunded'; refund = pay === 'refunded' ? total : Math.round(total * 0.5); cancelledAt = new Date(start.getTime() - 30 * 3600000); reason = pick(['Rain forecast', 'Team unavailable', 'Change of plan']); }
      try {
        const ref = status === 'cancelled' || status === 'confirmed' ? await nextRef(createdDate) : null;
        const checkedIn = status === 'confirmed' && isPast && rnd() > 0.15 ? new Date(start.getTime() - 5 * 60000) : null;
        const ins = await q(
          `INSERT INTO bookings(ref,turf_id,user_id,customer_name,customer_phone,customer_email,start_ts,end_ts,duration_min,status,payment_status,subtotal,discount,total,source,checkin_token,checked_in_at,cancelled_at,cancelled_by,cancel_reason,refund_amount,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
          [ref, turf.id, cust.id, cust.name, cust.phone, cust.email, start, end, dur, status, pay, subtotal, discount, total,
            rnd() > 0.8 ? 'admin' : 'online', 'tk' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12),
            checkedIn, cancelledAt, status === 'cancelled' ? 'admin' : null, reason, refund, new Date(start.getTime() - 2 * 86400000)]);
        const bid = ins.rows[0].id;
        await q(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,created_at) VALUES ($1,'payment','demo',$2,$3,'successful',$4,$5)`,
          [bid, pick(['UPI', 'Card', 'Net Banking']), total, 'demo_pay_' + Math.random().toString(36).slice(2, 12), new Date(start.getTime() - 2 * 86400000)]);
        if (refund > 0) await q(`INSERT INTO payments(booking_id,kind,provider,method,amount,status,txn_id,note,created_at) VALUES ($1,'refund','demo','Manual',$2,'successful',$3,$4,$5)`, [bid, refund, 'demo_rf_' + Math.random().toString(36).slice(2, 10), reason, cancelledAt]);
        made++;
      } catch (e) {
        if (e.code !== '23P01') throw e; // overlap: simply skip this random slot
      }
    }
  }
  console.log(`Created ${made} demo bookings.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
