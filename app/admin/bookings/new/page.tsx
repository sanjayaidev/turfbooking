import { q } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { istDate } from '@/lib/time';
import ManualBooking from '@/components/ManualBooking';
import { Empty, PageHeader } from '@/components/ui';

export const metadata = { title: 'New booking' };

export default async function NewBooking() {
  await requirePerm('bookings.create');
  const turfs = await q<any>("SELECT id,name,durations FROM turfs WHERE status='active' ORDER BY sort_order");
  return (
    <>
      <PageHeader title="New manual booking" subtitle="For walk-ins and phone bookings. Confirmed immediately, and the slot is protected like any online booking." />
      {turfs.length ? <ManualBooking turfs={turfs} today={istDate()} /> : <Empty title="No active turfs" hint="Create or activate a turf first." />}
    </>
  );
}
