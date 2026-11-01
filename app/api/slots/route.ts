import { NextRequest } from 'next/server';
import { daySlots } from '@/lib/slots';
import { getUser, can } from '@/lib/auth';
import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const turfId = p.get('turfId') || '';
    const admin = p.get('admin') === '1' && can(await getUser(), 'bookings.create');
    const r = await daySlots(turfId, p.get('date') || '', parseInt(p.get('duration') || '60', 10), { admin });
    if (r.turf.status !== 'active' && !admin) return fail('Turf unavailable', 404);
    return ok({ closed: r.closed, open: r.open, close: r.close, durations: r.turf.durations, slots: r.slots });
  } catch (e: any) {
    if (e?.message === 'Invalid date' || e?.message === 'Turf not found') return fail(e.message, 400);
    return handle(e);
  }
}
