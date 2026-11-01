'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, LogOut, User as UserIcon, LayoutDashboard } from 'lucide-react';

const links = [
  { href: '/turfs', label: 'Our Turfs' },
  { href: '/#how', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/track', label: 'Find booking' },
];

export default function NavMenu({ user }: { user: { name: string; role: string; staff: boolean } | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/'); router.refresh();
  }
  const account = user && (
    <>
      {user.staff && <Link href="/admin" className="btn-outline btn-sm" onClick={() => setOpen(false)}><LayoutDashboard className="h-4 w-4" />Admin</Link>}
      <Link href="/account" className="btn-ghost btn-sm" onClick={() => setOpen(false)}><UserIcon className="h-4 w-4" />{user.name.split(' ')[0]}</Link>
      <button onClick={logout} className="btn-ghost btn-sm" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
    </>
  );
  return (
    <>
      <nav className="hidden items-center gap-1 md:flex">
        {links.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">{l.label}</Link>)}
      </nav>
      <div className="hidden items-center gap-2 md:flex">
        {user ? account : (<><Link href="/login" className="btn-ghost">Sign in</Link><Link href="/turfs" className="btn-primary">Book Now</Link></>)}
      </div>
      <button className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-ink-100 bg-white p-4 shadow-pop md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-ink-50">{l.label}</Link>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {user ? account : (<><Link href="/login" className="btn-outline flex-1" onClick={() => setOpen(false)}>Sign in</Link><Link href="/turfs" className="btn-primary flex-1" onClick={() => setOpen(false)}>Book Now</Link></>)}
          </div>
        </div>
      )}
    </>
  );
}
