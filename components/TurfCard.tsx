import Link from 'next/link';
import { MapPin, ArrowUpRight, Sparkles } from 'lucide-react';
import TurfImage from './TurfImage';
import { inr } from '@/lib/time';

export default function TurfCard({ t }: { t: any }) {
  const from = Math.min(t.weekday_rate, t.weekend_rate);
  return (
    <Link href={`/turfs/${t.slug}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-pop">
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-900">
        <TurfImage src={t.images?.[0]} alt={t.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brand-800 backdrop-blur">{t.sport}</span>
        {t.promo_percent > 0 && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent-400 px-3 py-1 text-xs font-bold text-brand-950"><Sparkles className="h-3 w-3" />{t.promo_percent}% off</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-ink-900">{t.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500"><MapPin className="h-3.5 w-3.5" />{t.city}</p>
        <p className="mt-2 line-clamp-2 text-sm text-ink-600">{t.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(t.amenities || []).slice(0, 3).map((a: string) => <span key={a} className="rounded-md bg-ink-50 px-2 py-1 text-xs font-medium text-ink-600">{a}</span>)}
        </div>
        <div className="mt-auto flex items-end justify-between pt-5">
          <div><p className="text-xs text-ink-400">Starting from</p><p className="font-display text-xl font-extrabold text-brand-800">{inr(from)}<span className="text-sm font-medium text-ink-400"> / hr</span></p></div>
          <span className="btn-primary btn-sm">Book now <ArrowUpRight className="h-4 w-4" /></span>
        </div>
      </div>
    </Link>
  );
}
