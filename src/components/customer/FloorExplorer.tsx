'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';

export type FloorGroup = {
  floorLabel: string;
  floorNumber: number;
  roomCount: number;
  availableBeds: number;
  totalBeds: number;
};

type Props = {
  floors: FloorGroup[];
  pgSlug: string;
};

export function FloorExplorer({ floors, pgSlug }: Props) {
  if (floors.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Floor explorer</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Isometric-style overview — tap a floor to browse rooms.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {floors.map((floor) => (
          <ApgCard
            key={floor.floorNumber}
            tier="card"
            className="group p-5 transition hover:-translate-y-1 motion-reduce:transform-none"
          >
            <div
              className="mb-4 flex h-16 items-end justify-center gap-1"
              aria-hidden
            >
              {[...Array(Math.min(floor.roomCount, 5))].map((_, i) => (
                <div
                  key={i}
                  className="w-8 rounded-t-md bg-gradient-to-t from-apg-orange/40 to-apg-cyan/30 shadow-md transition group-hover:from-apg-orange/60"
                  style={{ height: `${24 + i * 8}px` }}
                />
              ))}
            </div>
            <h3 className="text-base font-semibold text-white">{floor.floorLabel}</h3>
            <p className="mt-1 text-xs text-apg-silver">
              {floor.roomCount} rooms · {floor.availableBeds}/{floor.totalBeds} beds free
            </p>
            <Link
              href={`/pgs/${pgSlug}#floor-${floor.floorNumber}`}
              className="mt-3 inline-block text-xs font-semibold text-apg-cyan hover:text-apg-orange"
            >
              Explore floor →
            </Link>
          </ApgCard>
        ))}
      </div>
    </section>
  );
}
