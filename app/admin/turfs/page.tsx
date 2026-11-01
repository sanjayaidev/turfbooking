import Link from 'next/link';
import { Plus, MapPin } from 'lucide-react';
import { q } from '@/lib/db';
import { can, getUser, requirePerm } from '@/lib/auth';
import { inr } from '@/lib/time';
import { Badge, PageHeader } from '@/components/ui';
import TurfImage from '@/components/TurfImage';
import { createTurf } from '../actions';

export const metadata = { title: 'Turfs & Pricing' };

export default async function AdminTurfs() {
  const user = await requirePerm();
  const turfs = await q<any>(`SELECT t.*, (SELECT count(*) FROM bookings b WHERE b.turf_id=t.id AND b.status='confirmed')::int AS bookings FROM turfs t ORDER BY sort_order, created_at`);
  return (
    <>
      <PageHeader title="Turfs & pricing" subtitle="Each turf has its own details, hours, pricing, durations and blocked periods." />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {turfs.map((t: any) => (
          <Link key={t.id} href={`/admin/turfs/${t.id}`} className="card group overflow-hidden transition hover:shadow-pop">
            <div className="relative aspect-[16/7] bg-brand-900"><TurfImage src={t.images?.[0]} alt={t.name} className="h-full w-full object-cover" /><span className="absolute right-3 top-3"><Badge tone={t.status === 'active' ? 'green' : 'grey'}>{t.status === 'active' ? 'Active' : 'Hidden'}</Badge></span></div>
            <div className="p-5"><p className="font-bold">{t.name}</p><p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500"><MapPin className="h-3.5 w-3.5" />{t.city} · {t.sport}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-ink-50 p-2"><p className="font-bold text-ink-800">{inr(t.weekday_rate)}</p><p className="text-ink-400">Weekday/hr</p></div><div className="rounded-lg bg-ink-50 p-2"><p className="font-bold text-ink-800">{inr(t.weekend_rate)}</p><p className="text-ink-400">Weekend/hr</p></div><div className="rounded-lg bg-ink-50 p-2"><p className="font-bold text-ink-800">{t.bookings}</p><p className="text-ink-400">Bookings</p></div></div></div>
          </Link>
        ))}
        {can(user, 'turfs.manage') && (
          <form action={createTurf} className="card flex flex-col justify-center gap-3 border-dashed p-6">
            <p className="flex items-center gap-2 font-bold"><Plus className="h-5 w-5 text-brand-600" />Add a new turf</p>
            <input name="name" className="input" placeholder="Turf name" required />
            <select name="sport" className="input"><option>Cricket</option><option>Box Cricket</option><option>Football</option><option>Multi-sport</option></select>
            <button className="btn-primary">Create turf</button>
          </form>
        )}
      </div>
    </>
  );
}
