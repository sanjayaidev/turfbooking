# TurfBooking: Cricket Turf Booking & Management (Demo)

Multi-turf booking platform with a customer site and an admin console (admin + staff roles).
Stack: Next.js 14 (App Router) · TypeScript · Tailwind · PostgreSQL (Railway) · no external services needed.

## Demo logins (seeded when `SEED_DEMO=true`)
| Role | Email | Password |
|---|---|---|
| Admin | admin@turfbooking.demo | Admin@123 |
| Staff (limited) | staff@turfbooking.demo | Staff@123 |
| Customer | demo@turfbooking.demo | Customer@123 |

## Deploy on Railway (about 5 minutes)
1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Provision PostgreSQL**, then **+ New → GitHub Repo** (this repo).
3. In the web service → **Variables**, add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference variable; uses the private network)
   - `AUTH_SECRET` = a long random string (`openssl rand -base64 32`)
   - `APP_URL` = your Railway public URL, e.g. `https://turfbooking.up.railway.app` (used inside QR codes)
   - `SEED_DEMO` = `true` (loads 3 turfs, sample bookings and demo logins on first start only)
   - `DEMO_MODE` = `true` (shows click-to-fill demo logins on the sign-in page)
4. Service → **Settings → Networking → Generate Domain**. Done.

Railway runs `npm run build` then `npm start`, which applies the schema automatically (safe to re-run) before booting.
For a real launch set `SEED_DEMO=false`, `DEMO_MODE=false`, and set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before the first start.
If you connect from your laptop via Railway's *public* URL, also set `DATABASE_SSL=true`.

## Run locally
```
cp .env.example .env      # fill DATABASE_URL (any Postgres 13+; needs the btree_gist extension)
npm install
npm run db:reset          # schema + demo data
npm run dev               # http://localhost:3000
```
`BASE=http://localhost:3000 DATABASE_URL=... node scripts/e2e.mjs` runs 66 end-to-end checks.

## What is in the demo
- **Customer:** home, turf list, turf page (gallery, amenities, hours, pricing, map), live slot grid (green/red/yellow/grey), durations, register/login, checkout with 10-minute lock + countdown, coupon, demo payment, booking ID `SBL-CRT-YYYYMMDD-XXXX`, QR code, receipt, booking history, find-booking by reference + mobile.
- **Admin:** dashboard (revenue, bookings, popular slots), bookings (search/filter/export CSV, manual booking, cancel, refunds, check-in), calendar, turfs (details, photos, amenities, durations, hours, base/peak/off-peak/holiday pricing, promo %, blocks/maintenance), coupons, customers, QR check-in (camera or paste), staff & per-staff permissions, settings (business info, cancellation policy, booking rules), email outbox, audit log.
- **Multi-turf:** every table is keyed by turf; add turfs from Admin → Turfs & Pricing.

## Backup & restore (Admin → Backup & restore, admin only)
- **Download:** one `.xlsx` workbook with a sheet for every table (plus a `_backup_info` sheet). Text longer than an Excel cell is split over `column~2`, `column~3`… and joined again on restore. The file contains customer details and password hashes, so keep it private.
- **Restore is delta based.** Upload a workbook and each sheet is compared with the live table by primary key. You get a preview (new rows, changed rows with old → new values, identical rows, rows only in the database) and choose which tables to apply. Missing rows are inserted and changed rows are updated. **Rows that exist only in the database are never deleted.**
- A row that cannot be restored (for example a booking whose slot has since been taken, or one that points at a missing turf) is skipped and reported; every other row still restores. The apply step is one transaction.
- Adding a table to `db/schema.sql`? Add it to `BACKUP_TABLES` in `lib/backup.ts` (parents before children). The page warns when a table is not covered.
- `BASE=http://localhost:3000 DATABASE_URL=... node scripts/backup-e2e.mjs` runs 53 checks for this feature (needs the demo seed).

## How double-booking is prevented
`bookings` has a PostgreSQL `EXCLUDE USING gist` constraint on (turf, time range) for active bookings, so even simultaneous requests cannot overlap. Unpaid holds expire after the lock time and are released automatically. Prices and coupons are always calculated on the server.

## Going to production: what to swap in
- **Payments:** the demo checkout lives in `lib/bookings.ts → payBooking()`. Replace it with: create Razorpay order → verify signature server-side → call `confirmInTx()`. Add a webhook route that calls the same confirm step (it is already idempotent).
- **Emails:** set `RESEND_API_KEY` and `EMAIL_FROM`; emails already queue in the `email_log` table and are sent through Resend. Reminder emails (24h / 1h) need a scheduler (Railway cron) calling a small job.
- **Photos:** paste image URLs in Admin → Turf → Details (the bundled images are illustrations).
- **Password reset / SMS-OTP:** not included in this demo.

## Database tables
users, turfs, operating_hours, pricing_rules, blocks, coupons, bookings, payments (payments + refunds), email_log, audit_logs, settings, ref_counters. See `db/schema.sql`.
