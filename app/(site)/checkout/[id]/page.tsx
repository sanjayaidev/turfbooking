import { redirect } from 'next/navigation';
import Link from 'next/link';
import { q1, expireStale } from '@/lib/db';
import { requireCustomer } from '@/lib/auth';
import CheckoutClient from '@/components/CheckoutClient';
import BookingSummary from '@/components/BookingSummary';

export const metadata = { title: 'Checkout' };

export default async function Checkout({ params }: { params: { id: string } }) {
  const user = await requireCustomer(`/checkout/${params.id}`);
  await expireStale();
  const b = await q1<any>(`SELECT b.*, t.name AS turf_name, t.sport AS turf_sport, t.address AS turf_address, t.promo_label FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.id=$1 AND b.user_id=$2`, [params.id, user.id]).catch(() => null);
  if (!b) redirect('/account');
  if (b.status === 'confirmed') redirect(`/bookings/${b.id}`);
  if (b.status !== 'reserved') {
    return (
      <div className="container-x grid min-h-[60vh] place-items-center py-12 text-center">
        <div className="max-w-sm"><h1 className="text-2xl font-extrabold">This reservation has ended</h1><p className="mt-2 text-ink-500">The 10-minute hold expired or was released, so the slot is open to others again.</p><Link href="/turfs" className="btn-primary mt-6">Start a new booking</Link></div>
      </div>
    );
  }
  return (
    <div className="container-x py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-ink-500">Review your booking and pay to confirm.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_440px]">
        <div className="space-y-5">
          <BookingSummary b={b} />
          <div className="card p-5 text-sm"><p className="label">Booking for</p><p className="font-semibold">{b.customer_name}</p><p className="text-ink-500">{b.customer_phone} · {b.customer_email}</p></div>
        </div>
        <CheckoutClient id={b.id} expiresAt={new Date(b.expires_at).toISOString()} subtotal={b.subtotal} discount={b.discount} total={b.total} coupon={b.coupon_code} promoLabel={b.promo_label} />
      </div>
    </div>
  );
}
