import { getUser } from '@/lib/auth';
import { releaseHold } from '@/lib/bookings';
import { fail, handle, ok } from '@/lib/api';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) return fail('Please sign in to continue.', 401);
    await releaseHold(params.id, user.id);
    return ok();
  } catch (e) { return handle(e); }
}
