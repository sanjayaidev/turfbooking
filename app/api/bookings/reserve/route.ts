import { getUser } from '@/lib/auth';
import { reserveSlot } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) return fail('Please sign in to continue.', 401);
    const b = await body(req);
    const id = await reserveSlot({
      turfId: String(b.turfId || ''), date: String(b.date || ''), startMin: Number(b.startMin), duration: Number(b.duration),
      customer: { name: user.name, phone: user.phone || '', email: user.email }, userId: user.id, source: 'online',
      couponCode: b.couponCode ? String(b.couponCode) : null,
    });
    return ok({ id });
  } catch (e) { return handle(e); }
}
