import { getUser } from '@/lib/auth';
import { applyCouponToBooking } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) return fail('Please sign in to continue.', 401);
    const b = await body(req);
    return ok(await applyCouponToBooking(params.id, user.id, b.code ? String(b.code) : null));
  } catch (e) { return handle(e); }
}
