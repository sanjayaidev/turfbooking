import { Trash2 } from 'lucide-react';
import { q } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { fmtDate, inr, istDate } from '@/lib/time';
import { Badge, PageHeader } from '@/components/ui';
import { deleteCoupon, saveCoupon, toggleCoupon } from '../actions';

export const metadata = { title: 'Coupons' };

export default async function Coupons() {
  await requirePerm('coupons.manage');
  const [coupons, turfs] = await Promise.all([q<any>('SELECT c.*, t.name AS turf_name FROM coupons c LEFT JOIN turfs t ON t.id=c.turf_id ORDER BY c.created_at DESC'), q<any>('SELECT id,name FROM turfs ORDER BY sort_order')]);
  const today = istDate();
  return (
    <>
      <PageHeader title="Coupons & promotions" subtitle="Coupon codes customers can apply at checkout. Validated on the server." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead className="border-b border-ink-100 bg-ink-50"><tr><th className="th">Code</th><th className="th">Discount</th><th className="th">Applies to</th><th className="th">Validity</th><th className="th">Used</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-ink-100">{coupons.map((c: any) => { const expired = c.valid_to && c.valid_to < today; return (
              <tr key={c.id} className={!c.active || expired ? 'opacity-60' : ''}>
                <td className="td"><p className="font-mono font-bold">{c.code}</p><p className="text-xs text-ink-500">{c.description}</p></td>
                <td className="td font-semibold">{c.discount_type === 'percent' ? `${c.value}%` : inr(c.value)}{c.max_discount ? <span className="block text-xs font-normal text-ink-500">max {inr(c.max_discount)}</span> : null}{c.min_amount > 0 && <span className="block text-xs font-normal text-ink-500">min {inr(c.min_amount)}</span>}</td>
                <td className="td text-sm text-ink-600">{c.turf_name || 'All turfs'}</td>
                <td className="td text-xs text-ink-600">{c.valid_from ? fmtDate(c.valid_from, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Any time'} → {c.valid_to ? fmtDate(c.valid_to, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry'}{expired && <span className="ml-1"><Badge tone="red">Expired</Badge></span>}</td>
                <td className="td text-sm">{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                <td className="td"><div className="flex justify-end gap-1.5"><form action={toggleCoupon}><input type="hidden" name="id" value={c.id} /><button className="btn-outline btn-sm">{c.active ? 'Disable' : 'Enable'}</button></form><form action={deleteCoupon}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm text-red-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button></form></div></td>
              </tr>); })}</tbody></table></div>
          {coupons.length === 0 && <p className="p-6 text-sm text-ink-500">No coupons yet.</p>}
        </div>
        <form action={saveCoupon} className="card space-y-4 p-6"><h2 className="font-bold">New coupon</h2>
          <div><label className="label">Code</label><input name="code" className="input font-mono uppercase" placeholder="SUMMER20" required /></div>
          <div><label className="label">Description</label><input name="description" className="input" placeholder="Shown to staff" /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Type</label><select name="discount_type" className="input"><option value="percent">Percent %</option><option value="flat">Flat ₹</option></select></div><div><label className="label">Value</label><input type="number" name="value" min={1} className="input" required /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Max discount ₹</label><input type="number" name="max_discount" min={1} className="input" placeholder="optional" /></div><div><label className="label">Min booking ₹</label><input type="number" name="min_amount" min={0} defaultValue={0} className="input" /></div></div>
          <div><label className="label">Turf</label><select name="turf_id" className="input"><option value="">All turfs</option>{turfs.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Valid from</label><input type="date" name="valid_from" className="input" /></div><div><label className="label">Valid to</label><input type="date" name="valid_to" className="input" /></div></div>
          <div><label className="label">Usage limit</label><input type="number" name="usage_limit" min={1} className="input" placeholder="unlimited" /></div>
          <button className="btn-primary w-full">Create coupon</button></form>
      </div>
    </>
  );
}
