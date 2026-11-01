import { q, q1, expireStale } from './db';
import { addDays, dowOf, isDateStr, istDate, tsOf } from './time';
import { priceQuote, Rule } from './pricing';
import { getSettings } from './settings';

export type SlotStatus = 'available' | 'booked' | 'held' | 'blocked' | 'past';
export type Slot = { startMin: number; endMin: number; status: SlotStatus; price: number | null };

export async function loadTurf(idOrSlug: string) {
  const col = /^[0-9a-f-]{36}$/i.test(idOrSlug) ? 'id' : 'slug';
  return q1<any>(`SELECT * FROM turfs WHERE ${col}=$1`, [idOrSlug]);
}
export async function loadRules(turfId: string): Promise<Rule[]> {
  return q<Rule>('SELECT id,name,kind,days,date_from,date_to,start_min,end_min,rate,active FROM pricing_rules WHERE turf_id=$1 AND active ORDER BY created_at', [turfId]);
}
export async function loadHours(turfId: string, date: string) {
  return q1<{ open_min: number; close_min: number; is_closed: boolean }>('SELECT open_min,close_min,is_closed FROM operating_hours WHERE turf_id=$1 AND dow=$2', [turfId, dowOf(date)]);
}

/**
 * Availability for one turf on one date, for a given duration.
 *  green  = available
 *  red    = booked (confirmed)
 *  yellow = held (someone is checking out, 10-minute lock)
 *  grey   = blocked / maintenance / in the past / outside the booking window
 */
export async function daySlots(turfId: string, date: string, duration: number, opts: { admin?: boolean } = {}) {
  if (!isDateStr(date)) throw new Error('Invalid date');
  await expireStale();
  const [turf, settings] = [await loadTurf(turfId), await getSettings()];
  if (!turf) throw new Error('Turf not found');
  const hours = await loadHours(turf.id, date);
  const closed = !hours || hours.is_closed || hours.close_min <= hours.open_min;
  const out: { turf: any; date: string; duration: number; closed: boolean; open: number; close: number; slots: Slot[] } = {
    turf, date, duration, closed: !!closed, open: hours?.open_min ?? 0, close: hours?.close_min ?? 0, slots: [],
  };
  if (closed || !turf.durations.includes(duration)) return out;

  const dayStart = tsOf(date, 0), dayEnd = tsOf(date, 1440);
  const [bookings, blocks, rules] = await Promise.all([
    q<{ start_ts: Date; end_ts: Date; status: string }>("SELECT start_ts,end_ts,status FROM bookings WHERE turf_id=$1 AND status IN ('reserved','confirmed') AND start_ts < $3 AND end_ts > $2", [turf.id, dayStart, dayEnd]),
    q<{ start_ts: Date; end_ts: Date }>('SELECT start_ts,end_ts FROM blocks WHERE turf_id=$1 AND start_ts < $3 AND end_ts > $2', [turf.id, dayStart, dayEnd]),
    loadRules(turf.id),
  ]);

  const now = Date.now();
  const today = istDate();
  const beyondWindow = !opts.admin && date > addDays(today, settings.booking.windowDays);
  const lead = opts.admin ? 0 : settings.booking.minLeadMinutes * 60000;

  for (let m = out.open; m + duration <= out.close; m += turf.slot_interval) {
    const s = tsOf(date, m).getTime(), e = s + duration * 60000;
    let status: SlotStatus = 'available';
    const overlap = (a: { start_ts: Date; end_ts: Date }) => a.start_ts.getTime() < e && a.end_ts.getTime() > s;
    if (blocks.some(overlap)) status = 'blocked';
    else if (bookings.some((b) => b.status === 'confirmed' && overlap(b))) status = 'booked';
    else if (bookings.some((b) => b.status === 'reserved' && overlap(b))) status = 'held';
    else if (beyondWindow || (opts.admin ? e <= now : s < now + lead)) status = 'past';
    out.slots.push({ startMin: m, endMin: m + duration, status, price: priceQuote(turf, rules, date, m, duration).afterPromo });
  }
  return out;
}
