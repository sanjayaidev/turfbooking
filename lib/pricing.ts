import { dowOf } from './time';

export type Rule = {
  id: string; name: string; kind: 'peak' | 'offpeak' | 'holiday'; days: number[] | null;
  date_from: string | null; date_to: string | null; start_min: number; end_min: number; rate: number; active: boolean;
};
export type PricedTurf = { weekday_rate: number; weekend_rate: number; promo_percent: number; promo_label?: string | null };

/** Hourly rate for one instant. Priority: holiday > peak > off-peak > weekday/weekend base. */
export function rateAt(turf: PricedTurf, rules: Rule[], date: string, minute: number): { rate: number; label: string | null } {
  const dow = dowOf(date);
  const active = rules.filter((r) => r.active && minute >= r.start_min && minute < r.end_min);
  const holiday = active.find((r) => r.kind === 'holiday' && r.date_from && r.date_to && date >= r.date_from && date <= r.date_to);
  if (holiday) return { rate: holiday.rate, label: holiday.name };
  const dayOk = (r: Rule) => !r.days || r.days.length === 0 || r.days.includes(dow);
  const peak = active.find((r) => r.kind === 'peak' && dayOk(r));
  if (peak) return { rate: peak.rate, label: peak.name };
  const off = active.find((r) => r.kind === 'offpeak' && dayOk(r));
  if (off) return { rate: off.rate, label: off.name };
  const weekend = dow === 0 || dow === 6;
  return { rate: weekend ? turf.weekend_rate : turf.weekday_rate, label: weekend ? 'Weekend rate' : 'Weekday rate' };
}

export type Segment = { from: number; to: number; rate: number; label: string | null };
export type Quote = { subtotal: number; promo: number; afterPromo: number; segments: Segment[] };

/** Priced in 15-minute slices so rate changes mid-booking are charged exactly. Always computed on the server. */
export function priceQuote(turf: PricedTurf, rules: Rule[], date: string, startMin: number, duration: number): Quote {
  const segments: Segment[] = [];
  let raw = 0;
  for (let m = startMin; m < startMin + duration; m += 15) {
    const { rate, label } = rateAt(turf, rules, date, m);
    raw += rate / 4;
    const last = segments[segments.length - 1];
    if (last && last.rate === rate && last.label === label && last.to === m) last.to = m + 15;
    else segments.push({ from: m, to: m + 15, rate, label });
  }
  const subtotal = Math.round(raw);
  const promo = Math.round((subtotal * (turf.promo_percent || 0)) / 100);
  return { subtotal, promo, afterPromo: subtotal - promo, segments };
}

export type Coupon = {
  id: string; code: string; discount_type: 'percent' | 'flat'; value: number; max_discount: number | null; min_amount: number;
  turf_id: string | null; valid_from: string | null; valid_to: string | null; usage_limit: number | null; used_count: number; active: boolean;
};

export function evalCoupon(c: Coupon | null, turfId: string, today: string, amount: number): { ok: boolean; discount: number; error?: string } {
  if (!c || !c.active) return { ok: false, discount: 0, error: 'Invalid coupon code' };
  if (c.turf_id && c.turf_id !== turfId) return { ok: false, discount: 0, error: 'This coupon is not valid for this turf' };
  if (c.valid_from && today < c.valid_from) return { ok: false, discount: 0, error: 'This coupon is not active yet' };
  if (c.valid_to && today > c.valid_to) return { ok: false, discount: 0, error: 'This coupon has expired' };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { ok: false, discount: 0, error: 'This coupon has reached its usage limit' };
  if (amount < c.min_amount) return { ok: false, discount: 0, error: `Minimum booking amount for this coupon is ₹${c.min_amount}` };
  let d = c.discount_type === 'percent' ? (amount * c.value) / 100 : c.value;
  if (c.max_discount != null) d = Math.min(d, c.max_discount);
  d = Math.min(Math.round(d), amount);
  return { ok: true, discount: d };
}
