import { q1 } from '@/lib/db';
import { createSession, hashPassword, normPhone, validEmail, validPhone } from '@/lib/auth';
import { body, fail, ok } from '@/lib/api';

export async function POST(req: Request) {
  const b = await body(req);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = normPhone(String(b.phone || ''));
  const password = String(b.password || '');
  if (name.length < 2) return fail('Please enter your full name.');
  if (!validPhone(phone)) return fail('Enter a valid 10-digit Indian mobile number.');
  if (!validEmail(email)) return fail('Enter a valid email address.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (await q1('SELECT 1 FROM users WHERE email=$1', [email])) return fail('An account with this email already exists. Try signing in.', 409);
  const u = await q1<any>("INSERT INTO users(name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,'customer') RETURNING id", [name, email, phone, await hashPassword(password)]);
  await createSession(u.id);
  return ok({ role: 'customer' });
}
