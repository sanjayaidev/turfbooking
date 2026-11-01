'use server';
import { redirect } from 'next/navigation';
import { q } from '@/lib/db';
import { getUser, normPhone, validPhone } from '@/lib/auth';

export async function updateProfile(fd: FormData) {
  const u = await getUser();
  if (!u) redirect('/login');
  const name = String(fd.get('name') || '').trim();
  const phone = normPhone(String(fd.get('phone') || ''));
  if (name.length < 2) redirect('/account?tab=profile&err=' + encodeURIComponent('Please enter your name'));
  if (!validPhone(phone)) redirect('/account?tab=profile&err=' + encodeURIComponent('Enter a valid 10-digit mobile number'));
  await q('UPDATE users SET name=$2, phone=$3 WHERE id=$1', [u.id, name, phone]);
  redirect('/account?tab=profile&msg=' + encodeURIComponent('Profile updated'));
}
