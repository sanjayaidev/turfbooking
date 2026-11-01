import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { q, q1 } from './db';

const COOKIE = 'tb_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me-please-32chars');

export type SessionUser = { id: string; name: string; email: string; phone: string | null; role: 'customer' | 'staff' | 'admin'; permissions: string[] };

// Permission keys. Admin always has everything; staff only what is ticked on their profile.
export const PERMISSIONS: { key: string; label: string; hint: string }[] = [
  { key: 'dashboard', label: 'Dashboard & revenue', hint: 'See totals, revenue and charts' },
  { key: 'bookings.view', label: 'View bookings', hint: 'Search and open bookings' },
  { key: 'bookings.create', label: 'Create manual bookings', hint: 'Walk-in / phone bookings' },
  { key: 'bookings.cancel', label: 'Cancel bookings & record refunds', hint: 'Sensitive: touches money' },
  { key: 'checkin', label: 'QR check-in', hint: 'Scan and verify customers' },
  { key: 'blocks', label: 'Block slots & maintenance', hint: 'Close the turf for a period' },
  { key: 'customers.view', label: 'View customers', hint: 'Customer list and history' },
  { key: 'export', label: 'Export reports (CSV)', hint: 'Download booking data' },
  { key: 'turfs.manage', label: 'Manage turfs & hours', hint: 'Edit details, photos, hours' },
  { key: 'pricing.manage', label: 'Manage pricing', hint: 'Rates, peak/holiday rules, promos' },
  { key: 'coupons.manage', label: 'Manage coupons', hint: 'Create and edit coupon codes' },
];

export function can(u: SessionUser | null, perm?: string): boolean {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.role !== 'staff') return false;
  if (!perm || perm === 'admin') return perm !== 'admin';
  return u.permissions.includes(perm);
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https'), path: '/', maxAge: 7 * 86400 });
}
export function destroySession() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await q1<any>('SELECT id,name,email,phone,role,permissions,active FROM users WHERE id=$1', [payload.uid]);
    if (!u || !u.active) return null;
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, permissions: u.permissions || [] };
  } catch {
    return null;
  }
});

/** For admin pages: redirects to login, or to the "no access" page. */
export async function requirePerm(perm?: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect('/login?next=/admin');
  if (u.role === 'customer') redirect('/account');
  if (perm && !can(u, perm)) redirect('/admin/forbidden');
  return u;
}
export async function requireCustomer(next = '/account'): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

/** For API routes. */
export async function guard(perm?: string): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) };
  if (perm && !can(user, perm)) return { error: NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 }) };
  return { user };
}

export async function audit(user: { id: string; name: string } | null, action: string, entity: string, entityId: string | null, details: any = null) {
  await q('INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES ($1,$2,$3,$4,$5,$6)', [user?.id ?? null, user?.name ?? 'System', action, entity, entityId, details]);
}

export function normPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}
export const validPhone = (p: string) => /^[6-9]\d{9}$/.test(normPhone(p));
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
