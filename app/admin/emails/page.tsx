import Link from 'next/link';
import { q } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { fmtDateTime } from '@/lib/time';
import { Badge, Empty, PageHeader } from '@/components/ui';

export const metadata = { title: 'Email outbox' };

export default async function Emails() {
  await requirePerm('bookings.view');
  const rows = await q<any>('SELECT e.*, b.ref FROM email_log e LEFT JOIN bookings b ON b.id=e.booking_id ORDER BY e.created_at DESC LIMIT 60');
  const live = !!process.env.RESEND_API_KEY;
  return (
    <>
      <PageHeader title="Email outbox" subtitle={live ? 'Emails are sent through Resend and logged here.' : 'Demo mode: emails are generated and stored here as previews (no real email is sent). Add RESEND_API_KEY to go live.'} />
      {rows.length === 0 ? <Empty title="No emails yet" hint="Confirmation, payment-failure and cancellation emails appear here." /> : (
        <div className="space-y-3">{rows.map((m: any) => (
          <details key={m.id} className="card group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
              <div className="min-w-0"><p className="truncate font-semibold">{m.subject}</p><p className="text-xs text-ink-500">To {m.to_email || '—'} · {fmtDateTime(m.created_at)}</p></div>
              <div className="flex items-center gap-2">{m.ref && m.booking_id && <Link href={`/admin/bookings/${m.booking_id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">{m.ref}</Link>}<Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'grey'}>{m.status === 'preview' ? 'Preview' : m.status}</Badge></div>
            </summary>
            <iframe title={m.subject} srcDoc={m.body_html} className="h-[420px] w-full border-t border-ink-100" sandbox="" />
          </details>))}</div>
      )}
    </>
  );
}
