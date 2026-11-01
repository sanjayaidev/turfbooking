'use client';
import { useState } from 'react';

const FALLBACK = '/img/turf-stripes.svg';
export default function TurfImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [s, setS] = useState(src || FALLBACK);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={s} alt={alt} className={className} loading="lazy" onError={() => s !== FALLBACK && setS(FALLBACK)} />;
}
