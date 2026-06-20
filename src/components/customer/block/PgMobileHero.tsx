'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { AmenityList } from '@/src/components/customer/AmenityList';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  pgName: string;
  locationLine: string;
  images: string[];
  startingDailyPaise: number;
  amenities: Record<string, unknown>;
  onViewRooms: () => void;
};

export function PgMobileHero({
  pgName,
  locationLine,
  images,
  startingDailyPaise,
  amenities,
  onViewRooms,
}: Props) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const hero = images[0] ?? null;

  return (
    <header className="-mx-4 overflow-hidden sm:-mx-6">
      {hero ? (
        <div className="relative aspect-[5/4] w-full sm:aspect-[16/9]">
          <Image src={hero} alt="" fill className="object-cover" priority sizes="100vw" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0f18] to-transparent" />
        </div>
      ) : (
        <div className="flex aspect-[5/4] items-center justify-center bg-white/5 text-apg-muted sm:aspect-[16/9]">
          {pgName}
        </div>
      )}

      {images.length > 1 ? (
        <div className="border-b border-white/5 px-4 py-3 sm:px-6">
          <div
            ref={galleryRef}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]"
          >
            {images.map((src) => (
              <div
                key={src}
                className="relative h-[72px] w-[96px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-white/10 shadow-sm"
              >
                <Image src={src} alt="" fill sizes="96px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-white sm:text-2xl">
          {pgName}
        </h1>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-apg-muted">{locationLine}</p>
        {startingDailyPaise > 0 ? (
          <p className="mt-4 text-lg font-bold text-apg-orange">
            From <span className="text-xl">{paiseToInr(startingDailyPaise)}</span>
            <span className="text-sm font-semibold text-apg-silver">/day</span>
          </p>
        ) : null}

        <button
          type="button"
          onClick={onViewRooms}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[16px] bg-apg-orange text-[15px] font-semibold text-white shadow-[0_4px_20px_rgba(255,120,50,0.25)] hover:brightness-105"
        >
          View rooms
        </button>

        <div className="mt-5 pb-1">
          <AmenityList amenities={amenities} variant="dark" />
        </div>
      </div>
    </header>
  );
}
