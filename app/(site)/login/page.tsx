import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Sign in' };

export default async function Page({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '';
  const user = await getUser();
  if (user) redirect(next || (user.role === 'customer' ? '/account' : '/admin'));
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="w-full max-w-md">
        <div className="card p-7 sm:p-9">
          <h1 className="text-2xl font-extrabold">Welcome back</h1>
          <p className="mt-1 mb-6 text-sm text-ink-500">Sign in to book slots and manage your bookings.</p>
          <AuthForm mode="login" next={next} demo={process.env.DEMO_MODE === 'true'} />
        </div>
      </div>
    </div>
  );
}
