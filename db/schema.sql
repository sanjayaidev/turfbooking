-- TurfBooking schema (idempotent: safe to run on every start)
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','admin')),
  permissions   text[] NOT NULL DEFAULT '{}',   -- only used for role = staff
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turfs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  tagline        text,
  description    text,
  sport          text NOT NULL DEFAULT 'Cricket',
  address        text,
  city           text,
  map_query      text,                          -- used for the Google Maps embed
  phone          text,
  email          text,
  images         text[] NOT NULL DEFAULT '{}',
  amenities      text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  slot_interval  int  NOT NULL DEFAULT 30 CHECK (slot_interval IN (15,30,60)),
  durations      int[] NOT NULL DEFAULT '{60,90,120}',
  weekday_rate   numeric(10,2) NOT NULL DEFAULT 1000,  -- per hour
  weekend_rate   numeric(10,2) NOT NULL DEFAULT 1400,  -- per hour
  promo_percent  numeric(5,2) NOT NULL DEFAULT 0,      -- auto-applied promotional discount
  promo_label    text,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operating_hours (
  turf_id    uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  dow        int  NOT NULL CHECK (dow BETWEEN 0 AND 6),   -- 0 = Sunday
  open_min   int  NOT NULL DEFAULT 360  CHECK (open_min BETWEEN 0 AND 1440),
  close_min  int  NOT NULL DEFAULT 1380 CHECK (close_min BETWEEN 0 AND 1440),
  is_closed  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (turf_id, dow)
);

-- peak / off-peak / holiday hourly-rate overrides
CREATE TABLE IF NOT EXISTS pricing_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id    uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('peak','offpeak','holiday')),
  days       int[],                -- days of week (peak/offpeak); NULL = every day
  date_from  date,                 -- holiday range
  date_to    date,
  start_min  int NOT NULL DEFAULT 0,
  end_min    int NOT NULL DEFAULT 1440,
  rate       numeric(10,2) NOT NULL,   -- per hour
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id    uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'block' CHECK (kind IN ('block','maintenance')),
  start_ts   timestamptz NOT NULL,
  end_ts     timestamptz NOT NULL,
  reason     text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_ts > start_ts)
);
CREATE INDEX IF NOT EXISTS blocks_turf_time ON blocks (turf_id, start_ts, end_ts);

CREATE TABLE IF NOT EXISTS coupons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  description   text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','flat')),
  value         numeric(10,2) NOT NULL,
  max_discount  numeric(10,2),
  min_amount    numeric(10,2) NOT NULL DEFAULT 0,
  turf_id       uuid REFERENCES turfs(id) ON DELETE CASCADE,  -- NULL = all turfs
  valid_from    date,
  valid_to      date,
  usage_limit   int,
  used_count    int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref_counters (
  day date PRIMARY KEY,
  n   int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref            text UNIQUE,                       -- SBL-CRT-YYYYMMDD-XXXX, assigned on confirmation
  turf_id        uuid NOT NULL REFERENCES turfs(id),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  start_ts       timestamptz NOT NULL,
  end_ts         timestamptz NOT NULL,
  duration_min   int NOT NULL,
  status         text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','cancelled','expired')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','successful','failed','refunded','partially_refunded')),
  subtotal       numeric(10,2) NOT NULL DEFAULT 0,
  discount       numeric(10,2) NOT NULL DEFAULT 0,
  total          numeric(10,2) NOT NULL DEFAULT 0,
  coupon_code    text,
  source         text NOT NULL DEFAULT 'online' CHECK (source IN ('online','admin')),
  expires_at     timestamptz,
  checkin_token  text UNIQUE,
  checked_in_at  timestamptz,
  checked_in_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at   timestamptz,
  cancelled_by   text,
  cancel_reason  text,
  refund_amount  numeric(10,2) NOT NULL DEFAULT 0,
  notes          text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (end_ts > start_ts)
);
CREATE INDEX IF NOT EXISTS bookings_turf_time ON bookings (turf_id, start_ts);
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings (status, expires_at);

-- THE double-booking guard: two active bookings on the same turf can never overlap.
-- Enforced inside Postgres, so it holds even under simultaneous requests.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (turf_id WITH =, tstzrange(start_ts, end_ts, '[)') WITH &&)
      WHERE (status IN ('reserved','confirmed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  provider    text NOT NULL DEFAULT 'demo',
  method      text,
  amount      numeric(10,2) NOT NULL,
  status      text NOT NULL CHECK (status IN ('pending','successful','failed')),
  txn_id      text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking ON payments (booking_id);

CREATE TABLE IF NOT EXISTS email_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid REFERENCES bookings(id) ON DELETE CASCADE,
  type        text NOT NULL,
  to_email    text,
  subject     text NOT NULL,
  body_html   text NOT NULL,
  status      text NOT NULL DEFAULT 'preview',   -- preview | sent | failed
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name   text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
