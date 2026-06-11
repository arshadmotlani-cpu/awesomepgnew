'use client';

import { useState } from 'react';

export function PgImageGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const list = images.length > 0 ? images : [];

  if (list.length === 0) {
    return (
      <div className="flex aspect-[2.2/1] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-apg-deep via-apg-charcoal to-[#2a1810]">
        <span className="text-sm font-semibold uppercase tracking-widest text-apg-silver/60">
          {name}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[2.2/1] overflow-hidden rounded-2xl border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={list[active]}
          alt={`${name} photo ${active + 1}`}
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-apg-charcoal/80 via-transparent to-transparent" />
      </div>
      {list.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={
                'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition ' +
                (i === active
                  ? 'border-apg-orange ring-2 ring-apg-orange/40'
                  : 'border-white/10 opacity-70 hover:opacity-100')
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
