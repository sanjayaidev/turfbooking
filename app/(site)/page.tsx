import Link from 'next/link';
import { ArrowRight, CalendarCheck, CreditCard, QrCode, ShieldCheck, Zap, Clock, MapPin, Phone, Mail, Star, ChevronDown, Lightbulb, BadgeIndianRupee } from 'lucide-react';
import { q, q1 } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import TurfCard from '@/components/TurfCard';

const FAQ = [
  ['How do I book a turf?', 'Choose a turf, pick a date, duration and a green start time, then check out. After payment you instantly get a booking ID and a QR code.'],
  ['How long is my slot held at checkout?', 'Your selected slot is locked for 10 minutes while you pay. If payment is not completed, the slot is released and you can start again.'],
  ['Can I cancel or reschedule?', 'Cancellation rules are set by the turf. If online cancellation is enabled you will see a Cancel button on your booking; otherwise please contact us.'],
  ['What should I show at the turf?', 'Show the QR code from your booking page (or your booking ID and mobile number). Our staff scans it to check you in.'],
  ['Which payment methods are accepted?', 'UPI, cards, net banking and wallets through our secure payment partner. (This demo uses a simulated checkout.)'],
  ['Do you provide equipment?', 'Some turfs offer bats, balls and stumps on rent. Check the amenities list on each turf page or call the turf.'],
];
const REVIEWS = [
  ['Aditya N.', 'Booked in under a minute and the floodlights are fantastic. Our Sunday league has moved here for good.', 5],
  ['Priyanka S.', 'Loved seeing live slot availability. No more calling around to ask who is free. Super smooth.', 5],
  ['Rohit P.', 'The QR check-in made entry quick. Great pitch quality and very friendly staff.', 4],
];

export default async function Home() {
  const [turfs, s, stats] = await Promise.all([
    q("SELECT * FROM turfs WHERE status='active' ORDER BY sort_order, created_at"),
    getSettings(),
    q1<any>("SELECT (SELECT count(*) FROM turfs WHERE status='active')::int AS turfs, (SELECT count(*) FROM bookings WHERE status='confirmed')::int AS bookings, (SELECT count(*) FROM users WHERE role='customer')::int AS players"),
  ]);
  const mapQ = encodeURIComponent(turfs[0]?.map_query || s.business.address);
  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-brand-950 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/turf-night.svg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-950 via-brand-950/80 to-transparent" />
        <div className="container-x py-20 sm:py-28 lg:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-accent-300 backdrop-blur"><Zap className="h-3.5 w-3.5" />Live availability · Instant confirmation</span>
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">Your game. Your turf.<br /><span className="text-accent-400">Booked in a minute.</span></h1>
          <p className="mt-6 max-w-xl text-lg text-brand-100">{s.business.tagline}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/turfs" className="btn-accent btn-lg">Book Now <ArrowRight className="h-5 w-5" /></Link>
            <Link href="/#how" className="btn btn-lg border border-white/25 text-white hover:bg-white/10">How it works</Link>
          </div>
          <dl className="mt-14 grid max-w-xl grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {[[stats.turfs, 'Turfs'], [stats.bookings + '+', 'Matches booked'], [stats.players + '+', 'Happy players']].map(([n, l]) => (
              <div key={l as string}><dt className="font-display text-3xl font-extrabold text-white">{n}</dt><dd className="text-sm text-brand-200">{l}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      {/* TURFS */}
      <section className="container-x py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-bold uppercase tracking-wider text-brand-600">Our turfs</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Pick your pitch</h2></div>
          <Link href="/turfs" className="btn-outline">View all turfs <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{turfs.map((t: any) => <TurfCard key={t.id} t={t} />)}</div>
      </section>

      {/* HOW */}
      <section id="how" className="scroll-mt-20 bg-white py-20">
        <div className="container-x">
          <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-bold uppercase tracking-wider text-brand-600">How it works</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">From search to stumps in 3 steps</h2></div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[[CalendarCheck, 'Choose date & time', 'See live green, red and yellow slots for every turf. Pick your duration and start time.'], [CreditCard, 'Pay securely', 'Your slot is locked for 10 minutes while you pay online. Prices are shown up front.'], [QrCode, 'Show your QR', 'Get a booking ID, an email confirmation and a QR code for quick check-in at the turf.']].map(([Icon, t, d], i) => {
              const I = Icon as any;
              return (
                <div key={i} className="relative rounded-2xl border border-ink-100 bg-ink-50/60 p-7">
                  <span className="absolute right-6 top-5 font-display text-5xl font-extrabold text-brand-100">{i + 1}</span>
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-white"><I className="h-6 w-6" /></div>
                  <h3 className="mt-5 text-lg font-bold">{t as string}</h3><p className="mt-2 text-sm leading-relaxed text-ink-600">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="container-x py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Why players love us</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Built for matches that actually start on time</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {[[Lightbulb, 'Floodlit evenings', 'Play after work under bright LED lights.'], [ShieldCheck, 'No double bookings', 'Every slot is protected end to end.'], [BadgeIndianRupee, 'Transparent pricing', 'Peak, off-peak and festival rates shown up front.'], [Clock, 'Flexible durations', 'From 30-minute nets to 3-hour matches.']].map(([Icon, t, d], i) => {
                const I = Icon as any;
                return <div key={i} className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700"><I className="h-5 w-5" /></div><div><p className="font-semibold">{t as string}</p><p className="text-sm text-ink-500">{d as string}</p></div></div>;
              })}
            </div>
          </div>
          <div className="grid gap-4">
            {REVIEWS.map(([n, t, r]) => (
              <figure key={n as string} className="card p-6">
                <div className="flex gap-0.5 text-amber-400">{Array.from({ length: r as number }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                <blockquote className="mt-3 text-ink-700">“{t as string}”</blockquote>
                <figcaption className="mt-3 text-sm font-semibold text-ink-900">{n as string} <span className="font-normal text-ink-400">· Sambalpur</span></figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-white py-20">
        <div className="container-x max-w-3xl">
          <div className="text-center"><p className="text-sm font-bold uppercase tracking-wider text-brand-600">FAQ</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Good to know</h2></div>
          <div className="mt-10 divide-y divide-ink-100 rounded-2xl border border-ink-100">
            {FAQ.map(([qn, a]) => (
              <details key={qn} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{qn}<ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition group-open:rotate-180" /></summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="container-x py-20">
        <div className="grid overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card lg:grid-cols-5">
          <div className="p-8 sm:p-10 lg:col-span-2">
            <h2 className="text-3xl font-extrabold">Find us in Sambalpur</h2>
            <p className="mt-3 text-ink-500">Questions about a booking, a tournament or a corporate event? We are happy to help.</p>
            <ul className="mt-8 space-y-4 text-sm">
              <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-600" />{s.business.address}</li>
              <li className="flex gap-3"><Phone className="h-5 w-5 shrink-0 text-brand-600" />{s.business.phone}</li>
              <li className="flex gap-3"><Mail className="h-5 w-5 shrink-0 text-brand-600" />{s.business.email}</li>
              <li className="flex gap-3"><Clock className="h-5 w-5 shrink-0 text-brand-600" />Open daily · see each turf for exact hours</li>
            </ul>
            <Link href="/turfs" className="btn-primary mt-8">Book Now <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <iframe title="Map" className="h-72 w-full border-0 lg:col-span-3 lg:h-full lg:min-h-[360px]" loading="lazy" src={`https://www.google.com/maps?q=${mapQ}&output=embed`} />
        </div>
      </section>
    </>
  );
}
