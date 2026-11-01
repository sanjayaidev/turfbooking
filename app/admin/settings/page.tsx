import { requirePerm } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui';
import { saveBookingSettings, saveBusiness, saveCancellation } from '../actions';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requirePerm('admin');
  const s = await getSettings();
  const rules = [...s.cancellation.rules].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return (
    <>
      <PageHeader title="Settings" subtitle="Business details, cancellation policy and booking rules." />
      <div className="grid gap-6 xl:grid-cols-2">
        <form action={saveBusiness} className="card space-y-4 p-6"><h2 className="font-bold">Business details</h2>
          <div><label className="label">Business name</label><input name="name" className="input" defaultValue={s.business.name} required /></div>
          <div><label className="label">Tagline (homepage)</label><input name="tagline" className="input" defaultValue={s.business.tagline} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Phone</label><input name="phone" className="input" defaultValue={s.business.phone} /></div><div><label className="label">Email</label><input name="email" className="input" defaultValue={s.business.email} /></div></div>
          <div><label className="label">Address</label><input name="address" className="input" defaultValue={s.business.address} /></div>
          <input type="hidden" name="whatsapp" value={s.business.whatsapp} />
          <button className="btn-primary">Save business details</button></form>

        <div className="space-y-6">
          <form action={saveCancellation} className="card space-y-4 p-6"><h2 className="font-bold">Cancellation policy</h2>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-ink-50 p-4"><input type="checkbox" name="enabled" defaultChecked={s.cancellation.enabled} className="mt-1 h-4 w-4 rounded border-ink-300 text-brand-700" /><span><span className="block font-semibold">Let customers cancel online</span><span className="block text-xs text-ink-500">When off, customers see a &ldquo;call the turf&rdquo; message and only you can cancel. Admin cancellations always work.</span></span></label>
            <div><p className="label">Refund rules</p><p className="mb-2 text-xs text-ink-400">Cancelling at least <b>X hours</b> before the start refunds <b>Y%</b>. The first matching rule (largest hours) wins; otherwise 0% is refunded.</p>
              <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid grid-cols-2 gap-3"><div className="relative"><input type="number" name={`h_${i}`} min={0} defaultValue={rules[i]?.hoursBefore} className="input pr-16" placeholder="e.g. 24" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">hrs before</span></div><div className="relative"><input type="number" name={`p_${i}`} min={0} max={100} defaultValue={rules[i]?.refundPercent} className="input pr-20" placeholder="e.g. 100" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">% refund</span></div></div>))}</div></div>
            <button className="btn-primary">Save policy</button></form>

          <form action={saveBookingSettings} className="card space-y-4 p-6"><h2 className="font-bold">Booking rules</h2>
            <div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Checkout lock (min)</label><input type="number" name="lockMinutes" min={2} max={60} defaultValue={s.booking.lockMinutes} className="input" /></div><div><label className="label">Advance window (days)</label><input type="number" name="windowDays" min={1} max={365} defaultValue={s.booking.windowDays} className="input" /></div><div><label className="label">Min lead time (min)</label><input type="number" name="minLeadMinutes" min={0} defaultValue={s.booking.minLeadMinutes} className="input" /></div></div>
            <p className="text-xs text-ink-400">Lock = how long a slot is held while the customer pays. Lead time = how close to the start time online booking stops.</p>
            <button className="btn-primary">Save booking rules</button></form>
        </div>
      </div>
    </>
  );
}
