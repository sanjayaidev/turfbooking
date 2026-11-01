import { NextResponse } from 'next/server';
import { BookingError } from './bookings';

export const ok = (data: any = {}) => NextResponse.json({ ok: true, ...data });
export const fail = (message: string, status = 400, extra: any = {}) => NextResponse.json({ ok: false, error: message, ...extra }, { status });

export function handle(e: unknown) {
  if (e instanceof BookingError) return fail(e.message, e.status, { code: e.code });
  console.error(e);
  return fail('Something went wrong. Please try again.', 500);
}
export async function body<T = any>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
