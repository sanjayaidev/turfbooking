import { Pool, PoolClient, types } from 'pg';

// numeric -> number, bigint -> number, date -> 'YYYY-MM-DD' string (no timezone surprises)
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

function makePool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}
export const pool: Pool = globalThis.__pool ?? (globalThis.__pool = makePool());

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function q1<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

/** Releases unpaid reservations whose 10-minute lock has run out. Cheap; called before every availability read/write. */
export async function expireStale(c: Pool | PoolClient = pool) {
  await c.query("UPDATE bookings SET status='expired' WHERE status='reserved' AND expires_at IS NOT NULL AND expires_at < now()");
}
