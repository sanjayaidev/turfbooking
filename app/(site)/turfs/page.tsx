import { q } from '@/lib/db';
import TurfCard from '@/components/TurfCard';
import { Empty } from '@/components/ui';

export const metadata = { title: 'Our Turfs' };

export default async function Turfs() {
  const turfs = await q("SELECT * FROM turfs WHERE status='active' ORDER BY sort_order, created_at");
  return (
    <div className="container-x py-12">
      <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Choose a turf</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">All turfs in Sambalpur</h1>
      <p className="mt-2 max-w-2xl text-ink-500">Each turf has its own timings, pricing and live availability. Pick one to see open slots.</p>
      <div className="mt-10">
        {turfs.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{turfs.map((t: any) => <TurfCard key={t.id} t={t} />)}</div> : <Empty title="No turfs yet" hint="Turfs added in the admin panel will appear here." />}
      </div>
    </div>
  );
}
