import Link from 'next/link';
import { Lock } from 'lucide-react';
import { getUser, can } from '@/lib/auth';

export default async function Forbidden() {
  const u = await getUser();
  const first = ['dashboard:/admin', 'bookings.view:/admin/bookings', 'checkin:/admin/checkin'].map((x) => x.split(':')).find(([p]) => can(u, p));
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div className="max-w-sm"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600"><Lock className="h-6 w-6" /></div>
        <h1 className="text-2xl font-extrabold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-ink-500">Ask an administrator to enable this permission on your staff profile.</p>
        {first && <Link href={first[1]} className="btn-primary mt-6">Go to {first[1] === '/admin' ? 'dashboard' : first[1].split('/').pop()}</Link>}
      </div>
    </div>
  );
}
