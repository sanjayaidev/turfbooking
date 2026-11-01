import { redirect } from 'next/navigation';
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const num = (fd: FormData, k: string, d = 0) => { const v = parseFloat(String(fd.get(k) ?? '')); return Number.isFinite(v) ? v : d; };
export const lines = (fd: FormData, k: string) => str(fd, k).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
export function back(path: string, msg: string, isErr = false): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${isErr ? 'err' : 'msg'}=${encodeURIComponent(msg)}`);
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'turf';
