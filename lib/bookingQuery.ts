import { q } from './db';

export type BookingFilters = { q?: string; turf?: string; date?: string; status?: string; pay?: string; source?: string };

export function buildWhere(f: BookingFilters) {
  const w: string[] = ["b.status <> 'expired'"];
  const p: any[] = [];
  const add = (sql: string, v: any) => { p.push(v); w.push(sql.replaceAll('?', `$${p.length}`)); };
  if (f.q) { const t = f.q.trim(); p.push(`%${t}%`); const n = p.length; w.push(`(b.ref ILIKE $${n} OR b.customer_name ILIKE $${n} OR b.customer_phone ILIKE $${n} OR b.customer_email ILIKE $${n})`); }
  if (f.turf && /^[0-9a-f-]{36}$/i.test(f.turf)) add('b.turf_id = ?', f.turf);
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) add("(b.start_ts AT TIME ZONE 'Asia/Kolkata')::date = ?::date", f.date);
  if (f.status && ['reserved', 'confirmed', 'cancelled'].includes(f.status)) add('b.status = ?', f.status);
  if (f.status === 'completed') w.push("b.status='confirmed' AND b.end_ts < now()");
  if (f.status === 'upcoming') w.push("b.status='confirmed' AND b.end_ts >= now()");
  if (f.pay && ['pending', 'successful', 'failed', 'refunded', 'partially_refunded'].includes(f.pay)) add('b.payment_status = ?', f.pay);
  if (f.source && ['online', 'admin'].includes(f.source)) add('b.source = ?', f.source);
  return { where: w.join(' AND '), params: p };
}

export async function searchBookings(f: BookingFilters, limit?: number, offset = 0) {
  const { where, params } = buildWhere(f);
  const rows = await q<any>(
    `SELECT b.*, t.name AS turf_name FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE ${where} ORDER BY b.start_ts DESC ${limit ? `LIMIT ${limit} OFFSET ${offset}` : ''}`, params);
  const [{ n }] = await q<any>(`SELECT count(*)::int AS n FROM bookings b WHERE ${where}`, params);
  return { rows, total: n };
}
