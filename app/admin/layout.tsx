import { Suspense } from 'react';
import { can, requirePerm } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import AdminNav, { NavItem } from '@/components/AdminNav';
import Toast from '@/components/Toast';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Admin', template: '%s · Admin' }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePerm();
  const s = await getSettings();
  const all: (NavItem & { perm: string | string[] })[] = [
    { href: '/admin', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard' },
    { href: '/admin/bookings', label: 'Bookings', icon: 'bookings', perm: 'bookings.view' },
    { href: '/admin/calendar', label: 'Calendar', icon: 'calendar', perm: 'bookings.view' },
    { href: '/admin/checkin', label: 'QR Check-in', icon: 'checkin', perm: 'checkin' },
    { href: '/admin/turfs', label: 'Turfs & Pricing', icon: 'turfs', perm: ['turfs.manage', 'pricing.manage', 'blocks'] },
    { href: '/admin/coupons', label: 'Coupons', icon: 'coupons', perm: 'coupons.manage' },
    { href: '/admin/customers', label: 'Customers', icon: 'customers', perm: 'customers.view' },
    { href: '/admin/emails', label: 'Email outbox', icon: 'emails', perm: 'bookings.view' },
    { href: '/admin/staff', label: 'Staff & roles', icon: 'staff', perm: 'admin' },
    { href: '/admin/settings', label: 'Settings', icon: 'settings', perm: 'admin' },
    { href: '/admin/audit', label: 'Audit log', icon: 'audit', perm: 'admin' },
  ];
  const items = all.filter((i) => (Array.isArray(i.perm) ? i.perm.some((p) => can(user, p)) : can(user, i.perm))).map(({ perm, ...r }) => r);
  return (
    <div className="min-h-screen bg-ink-50">
      <AdminNav items={items} user={{ name: user.name, role: user.role }} brand={s.business.name} />
      <Suspense><Toast /></Suspense>
      <main className="lg:pl-64"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div></main>
    </div>
  );
}
