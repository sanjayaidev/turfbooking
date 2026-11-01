import { redirect } from 'next/navigation';
import { can, getUser } from '@/lib/auth';
import CheckinClient from '@/components/CheckinClient';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'QR Check-in' };

export default async function CheckinPage({ searchParams }: { searchParams: { token?: string } }) {
  const u = await getUser();
  // QR codes open this URL; keep the token through the login redirect
  if (!u) redirect(`/login?next=${encodeURIComponent('/admin/checkin' + (searchParams.token ? `?token=${searchParams.token}` : ''))}`);
  if (u.role === 'customer') redirect('/account');
  if (!can(u, 'checkin')) redirect('/admin/forbidden');
  return (<><PageHeader title="QR check-in" subtitle="Scan the customer's booking QR to verify and check them in." /><CheckinClient initialToken={searchParams.token} /></>);
}
