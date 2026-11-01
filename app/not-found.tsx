import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-6 text-center">
      <div><p className="font-display text-7xl font-extrabold text-brand-700">404</p><h1 className="mt-2 text-2xl font-bold">Out of the park!</h1><p className="mt-2 text-ink-500">We couldn&apos;t find the page you were looking for.</p><Link href="/" className="btn-primary mt-6">Back to home</Link></div>
    </div>
  );
}
