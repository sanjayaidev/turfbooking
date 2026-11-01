import { q1 } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { body, fail, ok } from '@/lib/api';

export async function POST(req: Request) {
  const b = await body(req);
  const email = String(b.email || '').trim().toLowerCase();
  const u = await q1<any>('SELECT id,password_hash,role,active FROM users WHERE email=$1', [email]);
  if (!u || !u.active || !(await verifyPassword(String(b.password || ''), u.password_hash))) return fail('Incorrect email or password.', 401);
  await createSession(u.id);
  return ok({ role: u.role });
}
