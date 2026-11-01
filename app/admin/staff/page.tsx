import { q } from '@/lib/db';
import { PERMISSIONS, requirePerm } from '@/lib/auth';
import { fmtDate } from '@/lib/time';
import { Badge, PageHeader } from '@/components/ui';
import { createStaff, updateStaff } from '../actions';

export const metadata = { title: 'Staff & roles' };

function Perms({ selected = [] as string[] }: { selected?: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <label key={p.key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-100 p-3 hover:bg-ink-50">
          <input type="checkbox" name="perm" value={p.key} defaultChecked={selected.includes(p.key)} className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-700" />
          <span><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-ink-400">{p.hint}</span></span>
        </label>
      ))}
    </div>
  );
}

export default async function Staff() {
  const me = await requirePerm('admin');
  const users = await q<any>("SELECT id,name,email,phone,role,permissions,active,created_at FROM users WHERE role IN ('admin','staff') ORDER BY role, created_at");
  return (
    <>
      <PageHeader title="Staff & roles" subtitle="Admins can do everything. Staff only get the permissions you tick." />
      <div className="space-y-4">
        {users.map((u: any) => (
          <details key={u.id} className="card group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-800">{u.name[0]}</div><div><p className="font-semibold">{u.name} {u.id === me.id && <span className="text-xs font-normal text-ink-400">(you)</span>}</p><p className="text-xs text-ink-500">{u.email}</p></div></div>
              <div className="flex items-center gap-2"><Badge tone={u.role === 'admin' ? 'purple' : 'blue'}>{u.role === 'admin' ? 'Admin · full access' : `Staff · ${u.permissions.length} permissions`}</Badge>{!u.active && <Badge tone="red">Inactive</Badge>}<span className="text-xs font-semibold text-brand-700">Edit</span></div>
            </summary>
            <form action={updateStaff} className="space-y-4 border-t border-ink-100 p-5"><input type="hidden" name="id" value={u.id} />
              <div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Name</label><input name="name" className="input" defaultValue={u.name} required /></div><div><label className="label">New password</label><input name="password" type="password" className="input" placeholder="Leave blank to keep" autoComplete="new-password" /></div><label className="flex items-end gap-2 pb-2.5 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={u.active} className="h-4 w-4 rounded border-ink-300 text-brand-700" />Account active</label></div>
              {u.role === 'staff' ? <Perms selected={u.permissions} /> : <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">Admins always have every permission.</p>}
              <button className="btn-primary">Save changes</button></form>
          </details>
        ))}
      </div>
      <form action={createStaff} className="card mt-8 space-y-5 p-6"><h2 className="text-lg font-bold">Add a team member</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div className="lg:col-span-1"><label className="label">Name</label><input name="name" className="input" required /></div><div className="lg:col-span-2"><label className="label">Email (login)</label><input name="email" type="email" className="input" required /></div><div><label className="label">Mobile</label><input name="phone" className="input" /></div><div><label className="label">Password</label><input name="password" type="password" minLength={8} className="input" required autoComplete="new-password" /></div></div>
        <div><label className="label">Role</label><select name="role" className="input !w-auto"><option value="staff">Staff (limited by permissions)</option><option value="admin">Admin (full access)</option></select></div>
        <div><p className="label">Permissions (staff only)</p><Perms selected={['dashboard', 'bookings.view', 'bookings.create', 'checkin']} /></div>
        <button className="btn-primary">Add team member</button></form>
    </>
  );
}
