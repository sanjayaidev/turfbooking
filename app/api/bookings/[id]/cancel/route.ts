import { getUser } from '@/lib/auth';
import { cancelBooking } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) return fail('Please sign in to continue.', 401);
    const b = await body(req);
    const r = await cancelBooking(params.id, { type: 'customer', userId: user.id }, { reason: String(b.reason || 'Cancelled by customer') });
    return ok(r);
  } catch (e) { return handle(e); }
}
