import Link from 'next/link';
import { Phone, Mail, MapPin } from 'lucide-react';
import { getSettings } from '@/lib/settings';

export default async function Footer() {
  const s = (await getSettings()).business;
  return (
    <footer className="mt-20 bg-brand-950 text-brand-100">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/logo.svg" alt="" className="h-9 w-9" />
            <span className="font-display text-lg font-extrabold text-white">{s.name}</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-200">{s.tagline}</p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-300">Explore</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/turfs" className="hover:text-white">Our turfs</Link></li>
            <li><Link href="/#how" className="hover:text-white">How it works</Link></li>
            <li><Link href="/track" className="hover:text-white">Find my booking</Link></li>
            <li><Link href="/account" className="hover:text-white">My account</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-300">Contact</p>
          <ul className="space-y-2.5 text-sm">
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" />{s.phone}</li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{s.email}</li>
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{s.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-brand-300">© {new Date().getFullYear()} {s.name}. All rights reserved. Times are in IST.</div>
    </footer>
  );
}
