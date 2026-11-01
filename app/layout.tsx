import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  let name = 'TurfBooking';
  try { name = (await getSettings()).business.name; } catch {}
  return { title: { default: `${name} · Book cricket turfs online`, template: `%s · ${name}` }, description: 'Book cricket turfs in Sambalpur. Live availability, instant confirmation.', icons: { icon: '/icon.svg' } };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#136444' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
