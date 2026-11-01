'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function AuthForm({ mode, next, demo }: { mode: 'login' | 'register'; next: string; demo?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!j.ok) { setErr(j.error); setBusy(false); return; }
    const dest = next || (j.role === 'customer' ? '/account' : '/admin');
    router.push(dest); router.refresh();
  }
  function fill(email: string, password: string) { setF({ ...f, email, password }); }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'register' && (
        <>
          <div><label className="label">Full name</label><input className="input" required value={f.name} onChange={set('name')} autoComplete="name" placeholder="e.g. Rohit Panda" /></div>
          <div><label className="label">Mobile number</label><input className="input" required inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="10-digit mobile number" /></div>
        </>
      )}
      <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" /></div>
      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input className="input pr-11" type={show ? 'text' : 'password'} required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-label="Show password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <p className="text-center text-sm text-ink-500">
        {mode === 'login' ? <>New here? <Link className="font-semibold text-brand-700 hover:underline" href={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></> : <>Already registered? <Link className="font-semibold text-brand-700 hover:underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}
      </p>
      {demo && mode === 'login' && (
        <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-4 text-xs text-brand-900">
          <p className="mb-2 font-bold uppercase tracking-wide">Demo logins (click to fill)</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => fill('admin@turfbooking.demo', 'Admin@123')}>Admin</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => fill('staff@turfbooking.demo', 'Staff@123')}>Staff</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => fill('demo@turfbooking.demo', 'Customer@123')}>Customer</button>
          </div>
        </div>
      )}
    </form>
  );
}
