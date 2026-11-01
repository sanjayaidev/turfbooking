import { NextRequest } from 'next/server';
import { audit, guard } from '@/lib/auth';
import { checkIn, lookupByToken } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function GET(req: NextRequest) {
  try {
    const g = await guard('checkin');
    if ('error' in g) return g.error;
    const b = await lookupByToken(req.nextUrl.searchParams.get('token') || '');
    if (!b) return fail('Invalid QR code. This token does not match any booking.', 404);
    return ok({ booking: b });
  } catch (e) { return handle(e); }
}
export async function POST(req: Request) {
  try {
    const g = await guard('checkin');
    if ('error' in g) return g.error;
    const b = await body(req);
    const r = await checkIn(String(b.token || ''), g.user.id);
    if (r.result === 'ok') await audit(g.user, 'booking.checkin', 'booking', r.booking.id, null);
    return ok(r);
  } catch (e) { return handle(e); }
}
