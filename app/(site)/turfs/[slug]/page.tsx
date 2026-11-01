import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Phone, Mail, CheckCircle2, Clock, Tag } from 'lucide-react';
import { q } from '@/lib/db';
import { loadTurf } from '@/lib/slots';
import { getUser } from '@/lib/auth';
import { istDate, DOW, fmtMin, inr, fmtDate, DOW_SHORT } from '@/lib/time';
import Gallery from '@/components/Gallery';
import BookingWidget from '@/components/BookingWidget';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const t = await loadTurf(params.slug);
  return { title: t?.name || 'Turf' };
}

export default async function TurfPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string> }) {
  const turf = await loadTurf(params.slug);
  if (!turf || turf.status !== 'active') notFound();
  const [hours, rules, user] = await Promise.all([
    q<any>('SELECT * FROM operating_hours WHERE turf_id=$1 ORDER BY dow', [turf.id]),
    q<any>('SELECT * FROM pricing_rules WHERE turf_id=$1 AND active ORDER BY kind, created_at', [turf.id]),
    getUser(),
  ]);
  const today = istDate();
  const initial = { date: searchParams.date, duration: searchParams.duration ? +searchParams.duration : undefined, start: searchParams.start ? +searchParams.start : undefined };
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="container-x py-8 sm:py-10">
      <nav className="mb-4 text-sm text-ink-500"><Link href="/turfs" className="hover:text-brand-700">Turfs</Link> <span className="mx-1">/</span> <span className="text-ink-800">{turf.name}</span></nav>
      <Gallery images={turf.images} alt={turf.name} />
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="badge bg-brand-100 text-brand-800">{turf.sport}</span>{turf.promo_percent > 0 && <span className="badge bg-accent-300 text-brand-950">{turf.promo_label || `${turf.promo_percent}% off`}</span>}</div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{turf.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-ink-500"><MapPin className="h-4 w-4" />{turf.address}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div id="book" className="order-first min-w-0 scroll-mt-24 lg:order-last">
          <div className="lg:sticky lg:top-24">
            <BookingWidget turf={{ id: turf.id, slug: turf.slug, durations: turf.durations, promo_percent: turf.promo_percent, promo_label: turf.promo_label }} today={today} initial={initial} loggedIn={!!user} />
          </div>
        </div>

        <div className="min-w-0 space-y-8">
          <section className="card p-6">
            <h2 className="text-xl font-bold">About this turf</h2>
            <p className="mt-3 leading-relaxed text-ink-600">{turf.description}</p>
          </section>
          <section className="card p-6">
            <h2 className="text-xl font-bold">Facilities & amenities</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">{turf.amenities.map((a: string) => <li key={a} className="flex items-center gap-2.5 text-sm text-ink-700"><CheckCircle2 className="h-5 w-5 text-brand-600" />{a}</li>)}</ul>
          </section>
          <section className="card p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Clock className="h-5 w-5 text-brand-600" />Operating hours</h2>
            <div className="mt-4 divide-y divide-ink-100 text-sm">
              {order.map((d) => { const h = hours.find((x: any) => x.dow === d); return (
                <div key={d} className="flex justify-between py-2.5"><span className="font-medium text-ink-700">{DOW[d]}</span><span className="text-ink-500">{!h || h.is_closed ? 'Closed' : `${fmtMin(h.open_min)} – ${fmtMin(h.close_min)}`}</span></div>
              ); })}
            </div>
          </section>
          <section className="card p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Tag className="h-5 w-5 text-brand-600" />Pricing</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Weekday (Mon–Fri)</p><p className="mt-1 font-display text-2xl font-extrabold text-brand-800">{inr(turf.weekday_rate)}<span className="text-sm font-medium text-ink-400"> / hr</span></p></div>
              <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Weekend (Sat–Sun)</p><p className="mt-1 font-display text-2xl font-extrabold text-brand-800">{inr(turf.weekend_rate)}<span className="text-sm font-medium text-ink-400"> / hr</span></p></div>
            </div>
            {rules.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {rules.map((r: any) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2.5">
                    <span className="font-medium text-ink-700">{r.name} <span className="font-normal text-ink-400">· {r.kind === 'holiday' ? (r.date_from === r.date_to ? fmtDate(r.date_from) : `${fmtDate(r.date_from)} – ${fmtDate(r.date_to)}`) : (!r.days || r.days.length === 0 || r.days.length === 7 ? 'Every day' : r.days.map((d: number) => DOW_SHORT[d]).join(', '))}{r.kind !== 'holiday' || r.start_min !== 0 || r.end_min !== 1440 ? `, ${fmtMin(r.start_min)}–${fmtMin(r.end_min)}` : ''}</span></span>
                    <span className="font-bold text-brand-800">{inr(r.rate)}/hr</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-ink-400">Final price for your slot is calculated at checkout. Available durations: {turf.durations.map((d: number) => (d >= 60 ? `${d / 60}h` : `${d}m`)).join(' · ')}.</p>
          </section>
          <section className="card overflow-hidden">
            <div className="p-6"><h2 className="text-xl font-bold">Location & contact</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
                <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{turf.address}</li>
                {turf.phone && <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><a href={`tel:${turf.phone}`} className="hover:underline">{turf.phone}</a></li>}
                {turf.email && <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{turf.email}</li>}
              </ul></div>
            <iframe title="Map" className="h-64 w-full border-0" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent(turf.map_query || turf.address || turf.name)}&output=embed`} />
          </section>
        </div>
      </div>
    </div>
  );
}
