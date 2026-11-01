import { q } from './db';

export type Settings = {
  business: { name: string; tagline: string; phone: string; email: string; address: string; whatsapp: string };
  cancellation: { enabled: boolean; rules: { hoursBefore: number; refundPercent: number }[] };
  booking: { lockMinutes: number; windowDays: number; minLeadMinutes: number };
};
const FALLBACK: Settings = {
  business: { name: 'TurfBooking', tagline: '', phone: '', email: '', address: '', whatsapp: '' },
  cancellation: { enabled: false, rules: [] },
  booking: { lockMinutes: 10, windowDays: 60, minLeadMinutes: 30 },
};
export async function getSettings(): Promise<Settings> {
  const rows = await q<{ key: string; value: any }>('SELECT key, value FROM settings');
  const out: any = { ...FALLBACK };
  for (const r of rows) out[r.key] = { ...(FALLBACK as any)[r.key], ...r.value };
  return out as Settings;
}

/** % refunded if the customer cancels `hoursUntilStart` hours before the booking, per the admin's rules. */
export function refundPercentFor(s: Settings['cancellation'], hoursUntilStart: number): number {
  const rules = [...s.rules].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (const r of rules) if (hoursUntilStart >= r.hoursBefore) return r.refundPercent;
  return 0;
}
