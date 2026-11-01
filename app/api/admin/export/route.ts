import { NextRequest } from 'next/server';
import { guard } from '@/lib/auth';
import { searchBookings } from '@/lib/bookingQuery';
import { dateOfTs, fmtTime } from '@/lib/time';

export const dynamic = 'force-dynamic';
const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: NextRequest) {
  const g = await guard('export');
  if ('error' in g) return g.error;
  const p = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { rows } = await searchBookings(p);
  const head = ['Reference', 'Turf', 'Date', 'Start', 'End', 'Duration (min)', 'Customer', 'Phone', 'Email', 'Status', 'Payment', 'Subtotal', 'Discount', 'Total', 'Refunded', 'Coupon', 'Source', 'Checked in'];
  const lines = [head.join(',')];
  for (const b of rows) lines.push([b.ref || '', b.turf_name, dateOfTs(b.start_ts), fmtTime(b.start_ts), fmtTime(b.end_ts), b.duration_min, b.customer_name, b.customer_phone, b.customer_email, b.status, b.payment_status, b.subtotal, b.discount, b.total, b.refund_amount, b.coupon_code, b.source, b.checked_in_at ? 'Yes' : 'No'].map(esc).join(','));
  return new Response('﻿' + lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
