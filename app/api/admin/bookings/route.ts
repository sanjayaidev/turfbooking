import { audit, guard, normPhone, validEmail, validPhone } from '@/lib/auth';
import { reserveSlot } from '@/lib/bookings';
import { body, fail, handle, ok } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const g = await guard('bookings.create');
    if ('error' in g) return g.error;
    const b = await body(req);
    const name = String(b.name || '').trim();
    const phone = normPhone(String(b.phone || ''));
    const email = String(b.email || '').trim().toLowerCase();
    if (name.length < 2) return fail('Enter the customer name.');
    if (!validPhone(phone)) return fail('Enter a valid 10-digit mobile number.');
    if (email && !validEmail(email)) return fail('Enter a valid email or leave it blank.');
    const paid = b.payment !== 'pay_later';
    const id = await reserveSlot({
      turfId: String(b.turfId || ''), date: String(b.date || ''), startMin: Number(b.startMin), duration: Number(b.duration),
      customer: { name, phone, email: email || null }, source: 'admin', createdBy: g.user.id, couponCode: b.couponCode || null,
      notes: b.notes ? String(b.notes) : null, confirmNow: { paid, method: String(b.method || 'Cash') },
    });
    await audit(g.user, 'booking.create', 'booking', id, { manual: true, paid });
    return ok({ id });
  } catch (e) { return handle(e); }
}
