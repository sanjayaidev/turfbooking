// All business logic runs in Indian Standard Time (UTC+05:30, no daylight saving).
export const IST = '+05:30';
export const TZ = 'Asia/Kolkata';

export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
}
export function isDateStr(s: any): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime());
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dowOf(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}
export function tsOf(date: string, minute: number): Date {
  return new Date(new Date(`${date}T00:00:00${IST}`).getTime() + minute * 60000);
}
export function minuteOfDay(d: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = parseInt(p.find((x) => x.type === 'hour')!.value, 10) % 24;
  const m = parseInt(p.find((x) => x.type === 'minute')!.value, 10);
  return h * 60 + m;
}
export function fmtMin(min: number): string {
  if (min >= 1440) return '12:00 AM';
  const h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00' + IST : d) : d;
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts }).format(date);
}
export function fmtTime(d: Date | string): string {
  return fmtMin(minuteOfDay(new Date(d)));
}
export function fmtDateTime(d: Date | string): string {
  return `${fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}, ${fmtTime(d)}`;
}
export function dateOfTs(d: Date | string): string {
  return istDate(new Date(d));
}
export const inr = (n: number) => (n < 0 ? '-₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');
export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
