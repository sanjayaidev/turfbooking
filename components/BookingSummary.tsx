import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { fmtDate, fmtDuration, fmtTime } from '@/lib/time';

export default function BookingSummary({ b }: { b: any }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-brand-950 px-5 py-4 text-white"><p className="text-xs text-brand-200">{b.turf_sport}</p><p className="font-display text-lg font-bold">{b.turf_name}</p></div>
      <ul className="space-y-3 p-5 text-sm">
        <li className="flex gap-3"><CalendarDays className="h-5 w-5 shrink-0 text-brand-600" /><span className="font-medium">{fmtDate(b.start_ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></li>
        <li className="flex gap-3"><Clock className="h-5 w-5 shrink-0 text-brand-600" /><span className="font-medium">{fmtTime(b.start_ts)} – {fmtTime(b.end_ts)} <span className="font-normal text-ink-500">({fmtDuration(b.duration_min)})</span></span></li>
        <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-600" /><span className="text-ink-600">{b.turf_address}</span></li>
      </ul>
    </div>
  );
}
