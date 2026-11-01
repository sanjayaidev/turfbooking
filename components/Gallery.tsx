'use client';
import { useState } from 'react';
import TurfImage from './TurfImage';
import { cn } from './ui';

export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const list = images.length ? images : ['/img/turf-stripes.svg'];
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="aspect-[16/8] overflow-hidden rounded-3xl bg-brand-900 shadow-card">
        <TurfImage key={list[i]} src={list[i]} alt={alt} className="h-full w-full object-cover" />
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex gap-3">
          {list.map((src, n) => (
            <button key={src + n} onClick={() => setI(n)} className={cn('aspect-[16/10] w-24 overflow-hidden rounded-xl border-2 transition sm:w-32', n === i ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100')} aria-label={`Photo ${n + 1}`}>
              <TurfImage src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
