'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, CalendarDays, ListChecks, QrCode, Landmark, Ticket, Users, UserCog, Settings, Mail, ScrollText, Menu, X, LogOut, ExternalLink, PlusCircle } from 'lucide-react';
import { cn } from './ui';

const ICONS: Record<string, any> = { dashboard: LayoutDashboard, calendar: CalendarDays, bookings: ListChecks, checkin: QrCode, turfs: Landmark, coupons: Ticket, customers: Users, staff: UserCog, settings: Settings, emails: Mail, audit: ScrollText };

export type NavItem = { href: string; label: string; icon: string };

export default function AdminNav({ items, user, brand }: { items: NavItem[]; user: { name: string; role: string }; brand: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }
  const active = (h: string) => (h === '/admin' ? path === '/admin' : path.startsWith(h));
  const nav = (
    <div className="flex h-full flex-col">
      <Link href="/admin" className="flex items-center gap-2.5 px-5 py-5" onClick={() => setOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo.svg" alt="" className="h-9 w-9" />
        <div className="leading-tight"><p className="font-display text-base font-extrabold text-white">{brand}</p><p className="text-[11px] font-medium uppercase tracking-wider text-brand-300">Admin console</p></div>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((i) => {
          const I = ICONS[i.icon] || LayoutDashboard;
          return (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', active(i.href) ? 'bg-white/12 text-white' : 'text-brand-200 hover:bg-white/8 hover:text-white')} style={active(i.href) ? { background: 'rgba(255,255,255,.12)' } : undefined}>
              <I className="h-[18px] w-[18px]" />{i.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 px-2 py-1.5">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-400 text-sm font-bold text-brand-950">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 leading-tight"><p className="truncate text-sm font-semibold text-white">{user.name}</p><p className="text-xs capitalize text-brand-300">{user.role}</p></div>
        </div>
        <div className="flex gap-2">
          <Link href="/" target="_blank" className="btn-sm flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/8 py-2 text-xs font-semibold text-brand-100 hover:bg-white/15" style={{ background: 'rgba(255,255,255,.08)' }}><ExternalLink className="h-3.5 w-3.5" />Site</Link>
          <button onClick={logout} className="btn-sm flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-brand-100 hover:bg-white/15" style={{ background: 'rgba(255,255,255,.08)' }}><LogOut className="h-3.5 w-3.5" />Sign out</button>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-950 lg:block">{nav}</aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-100 bg-white px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-lg border border-ink-200"><Menu className="h-5 w-5" /></button>
        <span className="font-display font-extrabold text-brand-900">{brand}</span>
        <Link href="/admin/bookings/new" className="grid h-10 w-10 place-items-center rounded-lg bg-brand-700 text-white" aria-label="New booking"><PlusCircle className="h-5 w-5" /></Link>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-brand-950 shadow-pop"><button className="absolute right-3 top-4 text-white" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>{nav}</div>
        </div>
      )}
    </>
  );
}
