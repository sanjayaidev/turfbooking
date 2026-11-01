import { getUser } from '@/lib/auth';
import { payBooking } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) return fail('Please sign in to continue.', 401);
    const b = await body(req);
    const outcome = b.outcome === 'fail' ? 'fail' : 'success';
    const r = await payBooking(params.id, user.id, outcome, String(b.method || 'UPI'));
    return ok(r);
  } catch (e) { return handle(e); }
}
