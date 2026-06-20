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
    <header className="overflow-hidden rounded-3xl border border-white/10 apg-glass">
      {hero ? (
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/9]">
          <Image src={hero} alt="" fill className="object-cover" priority sizes="100vw" />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-white/5 text-apg-muted sm:aspect-[16/9]">
          {pgName}
        </div>
      )}

      {images.length > 1 ? (
        <div className="border-t border-white/5 px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-apg-silver">
            <span>Photos</span>
            <button
              type="button"
              className="font-semibold text-apg-cyan"
              onClick={() => galleryRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}
            >
              Swipe gallery →
            </button>
          </div>
          <div
            ref={galleryRef}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
          >
            {images.map((src, i) => (
              <div
                key={src}
                className="relative h-20 w-28 shrink-0 snap-start overflow-hidden rounded-xl border border-white/10"
              >
                <Image src={src} alt="" fill sizes="112px" className="object-cover" />
                {i === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[9px] text-white">
                    Cover
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="p-5 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">{pgName}</h1>
        <p className="mt-1.5 line-clamp-2 text-sm text-apg-silver sm:text-base">{locationLine}</p>
        {startingDailyPaise > 0 ? (
          <p className="mt-4 text-2xl font-bold text-apg-orange sm:text-3xl">
            From {paiseToInr(startingDailyPaise)}/day
          </p>
        ) : null}

        <button
          type="button"
          onClick={onViewRooms}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white hover:brightness-110 sm:text-lg"
        >
          View Rooms
        </button>

        <div className="mt-5">
          <AmenityList amenities={amenities} variant="dark" />
        </div>
      </div>
    </header>
  );
}
