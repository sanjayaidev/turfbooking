import Link from 'next/link';
import { getUser, can } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import NavMenu from './NavMenu';

export default async function Navbar() {
  const [user, s] = await Promise.all([getUser(), getSettings()]);
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur-lg">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" className="h-9 w-9" />
          <span className="font-display text-lg font-extrabold tracking-tight text-brand-900">{s.business.name}</span>
        </Link>
        <NavMenu user={user ? { name: user.name, role: user.role, staff: can(user, undefined) && user.role !== 'customer' } : null} />
      </div>
    </header>
  );
}
