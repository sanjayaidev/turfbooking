import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { q, q1 } from '@/lib/db';
import { can, requirePerm } from '@/lib/auth';
import { DOW, DOW_SHORT, fmtDate, fmtDateTime, fmtMin, inr } from '@/lib/time';
import { Badge, cn } from '@/components/ui';
import { TimeSelect } from '@/components/Time';
import TurfImage from '@/components/TurfImage';
import { addBlock, addRule, deleteBlock, deleteRule, toggleRule, updateHours, updatePricing, updateTurf } from '../../actions';

export const metadata = { title: 'Edit turf' };
const DURS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300];

export default async function EditTurf({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const user = await requirePerm();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const t = await q1<any>('SELECT * FROM turfs WHERE id=$1', [params.id]);
  if (!t) notFound();
  const tabs = [['details', 'Details', 'turfs.manage'], ['hours', 'Operating hours', 'turfs.manage'], ['pricing', 'Pricing', 'pricing.manage'], ['blocks', 'Blocks & maintenance', 'blocks']].filter(([, , p]) => can(user, p));
  if (!tabs.length) return null;
  const tab = tabs.find(([k]) => k === searchParams.tab)?.[0] || tabs[0][0];
  const [hours, rules, blocks] = await Promise.all([
    q<any>('SELECT * FROM operating_hours WHERE turf_id=$1 ORDER BY dow', [t.id]),
    q<any>('SELECT * FROM pricing_rules WHERE turf_id=$1 ORDER BY kind, created_at', [t.id]),
    q<any>('SELECT * FROM blocks WHERE turf_id=$1 AND end_ts > now() - interval \'1 day\' ORDER BY start_ts', [t.id]),
  ]);
  return (
    <>
      <Link href="/admin/turfs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" />All turfs</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold sm:text-3xl">{t.name}</h1><div className="flex gap-2"><Badge tone={t.status === 'active' ? 'green' : 'grey'}>{t.status === 'active' ? 'Visible to customers' : 'Hidden'}</Badge><Link href={`/turfs/${t.slug}`} target="_blank" className="btn-outline btn-sm">View on site ↗</Link></div></div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {tabs.map(([k, l]) => <Link key={k} href={`/admin/turfs/${t.id}?tab=${k}`} className={cn('flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-semibold', tab === k ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-50')}>{l}</Link>)}
      </div>

      {tab === 'details' && (
        <form action={updateTurf} className="grid gap-6 lg:grid-cols-3">
          <input type="hidden" name="id" value={t.id} />
          <div className="card space-y-4 p-6 lg:col-span-2">
            <h2 className="font-bold">Basic information</h2>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Turf name</label><input name="name" className="input" defaultValue={t.name} required /></div><div><label className="label">Sport / type</label><input name="sport" className="input" defaultValue={t.sport} /></div></div>
            <div><label className="label">Tagline</label><input name="tagline" className="input" defaultValue={t.tagline || ''} /></div>
            <div><label className="label">Description</label><textarea name="description" rows={4} className="input" defaultValue={t.description || ''} /></div>
            <div><label className="label">Amenities (one per line)</label><textarea name="amenities" rows={5} className="input" defaultValue={t.amenities.join('\n')} /></div>
            <div><label className="label">Photo URLs (one per line, first is the cover)</label><textarea name="images" rows={4} className="input font-mono text-xs" defaultValue={t.images.join('\n')} />
              <div className="mt-2 flex gap-2">{t.images.slice(0, 4).map((s: string) => <div key={s} className="h-14 w-24 overflow-hidden rounded-lg bg-ink-100"><TurfImage src={s} alt="" className="h-full w-full object-cover" /></div>)}</div>
              <p className="mt-1 text-xs text-ink-400">Paste image links (e.g. from Unsplash or your own hosting). Broken links fall back to a default image.</p></div>
          </div>
          <div className="space-y-6">
            <div className="card space-y-4 p-6"><h2 className="font-bold">Location & contact</h2>
              <div><label className="label">Address</label><input name="address" className="input" defaultValue={t.address || ''} /></div>
              <div><label className="label">City</label><input name="city" className="input" defaultValue={t.city || ''} /></div>
              <div><label className="label">Google Maps search text</label><input name="map_query" className="input" defaultValue={t.map_query || ''} placeholder="e.g. Burla, Sambalpur" /></div>
              <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={t.phone || ''} /></div>
              <div><label className="label">Email</label><input name="email" className="input" defaultValue={t.email || ''} /></div></div>
            <div className="card space-y-4 p-6"><h2 className="font-bold">Booking setup</h2>
              <div><label className="label">Slot start interval</label><select name="slot_interval" className="input" defaultValue={t.slot_interval}><option value={15}>Every 15 min</option><option value={30}>Every 30 min</option><option value={60}>Every hour</option></select></div>
              <div><label className="label">Available durations</label><div className="flex flex-wrap gap-2">{DURS.map((d) => <label key={d} className="cursor-pointer"><input type="checkbox" name="durations" value={d} defaultChecked={t.durations.includes(d)} className="peer sr-only" /><span className="inline-block rounded-full border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-600 peer-checked:border-brand-700 peer-checked:bg-brand-50 peer-checked:text-brand-800">{d >= 60 ? `${d / 60} hr` : `${d} min`}</span></label>)}</div><p className="mt-1 text-xs text-ink-400">Each duration must be a multiple of the slot interval.</p></div>
              <div><label className="label">Status</label><select name="status" className="input" defaultValue={t.status}><option value="active">Active, bookable</option><option value="inactive">Hidden from customers</option></select></div>
              <button className="btn-primary w-full">Save turf details</button></div>
          </div>
        </form>
      )}

      {tab === 'hours' && (
        <form action={updateHours} className="card max-w-3xl p-6"><input type="hidden" name="id" value={t.id} />
          <h2 className="font-bold">Operating hours</h2><p className="mb-4 text-sm text-ink-500">Set different timings for weekdays and weekends, or mark a day closed. Times are in IST.</p>
          <div className="divide-y divide-ink-100">
            {hours.map((h: any) => (
              <div key={h.dow} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[130px_1fr_1fr_auto]">
                <p className="font-semibold">{DOW[h.dow]}</p>
                <div className="order-3 sm:order-none"><TimeSelect name={`open_${h.dow}`} value={h.open_min} /></div>
                <div className="order-4 sm:order-none"><TimeSelect name={`close_${h.dow}`} value={h.close_min} endOfDay /></div>
                <label className="order-2 flex items-center gap-2 text-sm text-ink-600 sm:order-none"><input type="checkbox" name={`closed_${h.dow}`} defaultChecked={h.is_closed} className="h-4 w-4 rounded border-ink-300 text-brand-700" />Closed</label>
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4">Save hours</button>
        </form>
      )}

      {tab === 'pricing' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form action={updatePricing} className="card space-y-4 p-6"><input type="hidden" name="id" value={t.id} /><h2 className="font-bold">Base rates</h2>
            <div><label className="label">Weekday rate (₹ / hour)</label><input type="number" name="weekday_rate" min={0} step={10} defaultValue={t.weekday_rate} className="input" /><p className="mt-1 text-xs text-ink-400">Monday to Friday</p></div>
            <div><label className="label">Weekend rate (₹ / hour)</label><input type="number" name="weekend_rate" min={0} step={10} defaultValue={t.weekend_rate} className="input" /><p className="mt-1 text-xs text-ink-400">Saturday and Sunday</p></div>
            <div className="border-t border-ink-100 pt-4"><label className="label">Promotional discount (%)</label><input type="number" name="promo_percent" min={0} max={90} step={1} defaultValue={t.promo_percent} className="input" /><p className="mt-1 text-xs text-ink-400">Applied automatically to every booking. 0 = off.</p></div>
            <div><label className="label">Promo label</label><input name="promo_label" className="input" defaultValue={t.promo_label || ''} placeholder="e.g. Launch offer: 10% off" /></div>
            <button className="btn-primary w-full">Save base pricing</button></form>

          <div className="space-y-6 lg:col-span-2">
            <div className="card p-6"><h2 className="font-bold">Peak, off-peak & holiday rules</h2><p className="mb-4 text-sm text-ink-500">Priority: holiday → peak → off-peak → base rate. Rates apply per hour and are prorated if a booking crosses a rule boundary.</p>
              {rules.length === 0 ? <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-500">No rules yet. Add one below.</p> : (
                <ul className="space-y-2">{rules.map((r: any) => (
                  <li key={r.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3', r.active ? 'border-ink-100' : 'border-dashed border-ink-200 opacity-60')}>
                    <div><p className="flex items-center gap-2 font-semibold">{r.name}<Badge tone={r.kind === 'peak' ? 'red' : r.kind === 'holiday' ? 'purple' : 'blue'}>{r.kind === 'offpeak' ? 'Off-peak' : r.kind[0].toUpperCase() + r.kind.slice(1)}</Badge></p>
                      <p className="text-xs text-ink-500">{r.kind === 'holiday' ? (r.date_from === r.date_to ? fmtDate(r.date_from) : `${fmtDate(r.date_from)} – ${fmtDate(r.date_to)}`) : (!r.days?.length || r.days.length === 7 ? 'Every day' : r.days.map((d: number) => DOW_SHORT[d]).join(', '))} · {fmtMin(r.start_min)} – {fmtMin(r.end_min)}</p></div>
                    <div className="flex items-center gap-2"><span className="font-display text-lg font-extrabold text-brand-800">{inr(r.rate)}<span className="text-xs font-medium text-ink-400">/hr</span></span>
                      <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="turf" value={t.id} /><button className="btn-outline btn-sm">{r.active ? 'Disable' : 'Enable'}</button></form>
                      <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="turf" value={t.id} /><button className="btn-ghost btn-sm text-red-600" aria-label="Delete rule"><Trash2 className="h-4 w-4" /></button></form></div>
                  </li>))}</ul>)}
            </div>
            <form action={addRule} className="card space-y-4 p-6"><input type="hidden" name="id" value={t.id} /><h2 className="font-bold">Add a rule</h2>
              <div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Name</label><input name="name" className="input" placeholder="e.g. Evening peak" required /></div>
                <div><label className="label">Type</label><select name="kind" className="input"><option value="peak">Peak hours</option><option value="offpeak">Off-peak hours</option><option value="holiday">Holiday / special day</option></select></div>
                <div><label className="label">Rate (₹ / hour)</label><input type="number" name="rate" min={1} step={10} className="input" required /></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">From time</label><TimeSelect name="start_min" value={0} /></div><div><label className="label">To time</label><TimeSelect name="end_min" value={1440} endOfDay /></div></div>
              <div><label className="label">Days (peak / off-peak). Leave empty for every day</label><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map((d) => <label key={d} className="cursor-pointer"><input type="checkbox" name="days" value={d} className="peer sr-only" /><span className="inline-block rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-600 peer-checked:border-brand-700 peer-checked:bg-brand-50 peer-checked:text-brand-800">{DOW_SHORT[d]}</span></label>)}</div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Holiday: from date</label><input type="date" name="date_from" className="input" /></div><div><label className="label">Holiday: to date</label><input type="date" name="date_to" className="input" /></div></div>
              <button className="btn-primary">Add rule</button></form>
          </div>
        </div>
      )}

      {tab === 'blocks' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form action={addBlock} className="card space-y-4 p-6"><input type="hidden" name="turf" value={t.id} /><h2 className="font-bold">Block a period</h2>
            <div><label className="label">Type</label><select name="kind" className="input"><option value="block">Blocked (private event, etc.)</option><option value="maintenance">Maintenance</option></select></div>
            <div><label className="label">Starts</label><input type="datetime-local" name="start" className="input" required /></div>
            <div><label className="label">Ends</label><input type="datetime-local" name="end" className="input" required /></div>
            <div><label className="label">Reason</label><input name="reason" className="input" placeholder="e.g. Pitch rolling" /></div>
            <button className="btn-primary w-full">Block period</button><p className="text-xs text-ink-400">Blocked periods show as grey to customers and cannot be booked. You cannot block time that already has bookings.</p></form>
          <div className="card p-6 lg:col-span-2"><h2 className="mb-4 font-bold">Blocked & maintenance periods</h2>
            {blocks.length === 0 ? <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-500">Nothing blocked. The turf follows its normal operating hours.</p> : <ul className="space-y-2">{blocks.map((b: any) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-4 py-3"><div><p className="flex items-center gap-2 font-semibold">{b.reason || (b.kind === 'maintenance' ? 'Maintenance' : 'Blocked')}<Badge tone={b.kind === 'maintenance' ? 'yellow' : 'grey'}>{b.kind}</Badge></p><p className="text-xs text-ink-500">{fmtDateTime(b.start_ts)} → {fmtDateTime(b.end_ts)}</p></div>
                <form action={deleteBlock}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="turf" value={t.id} /><button className="btn-outline btn-sm">Remove</button></form></li>))}</ul>}
          </div>
        </div>
      )}
    </>
  );
}
