import { audit, guard } from '@/lib/auth';
import { buildBackup } from '@/lib/backup';
import { fail } from '@/lib/api';
import { istDate } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Downloads every table as one sheet of an .xlsx workbook. Admin only: the file contains password hashes. */
export async function GET() {
  const g = await guard('admin');
  if ('error' in g) return g.error;
  try {
    const { buffer, summary } = await buildBackup(g.user.name);
    await audit(g.user, 'backup.download', 'backup', null, { tables: summary.length, rows: summary.reduce((a, s) => a + s.rows, 0) });
    const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', '');
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="turfbooking-backup-${istDate()}-${stamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(e);
    return fail('The backup could not be created. Please try again.', 500);
  }
}
