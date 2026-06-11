'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { defaultBrowseStayQuery } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
import { AmenityList } from './AmenityList';
import { GenderBadge } from './GenderBadge';
import { PgPaymentsPanel } from './PgPaymentsPanel';

export type PgCardData = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  amenities: Record<string, unknown>;
  description: string | null;
  heroImage: string | null;
  totalBeds: number;
  availableBeds: number;
  startingFromPaise: number;
  hasPaymentEnabled?: boolean;
};

export function PgCard({
  pg,
  uploadScreenshot,
}: {
  pg: PgCardData;
  uploadScreenshot?: (formData: FormData) => Promise<string>;
}) {
  return (
    <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }} className="apg-glass overflow-hidden rounded-2xl">
      <Link
        href={`/pgs/${pg.slug}?${defaultBrowseStayQuery()}`}
        className="group flex flex-col transition-all"
        data-roachie-focus="pg-card"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[#1A1F27] via-[#0B0F14] to-[#2a1810]">
          {pg.heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pg.heroImage}
              alt={`${pg.name} hero`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wider text-apg-silver">
              {pg.name}
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            <GenderBadge policy={pg.genderPolicy} />
          </div>
          <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-apg-silver backdrop-blur">
            {pg.totalBeds > 0 && pg.availableBeds === 0
              ? 'Fully occupied · no beds'
              : `${pg.availableBeds} of ${pg.totalBeds} beds free today`}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="text-base font-semibold text-white group-hover:text-[#FF5A1F] transition-colors">
              {pg.name}
            </h3>
            <p className="mt-0.5 text-xs text-apg-silver">
              {pg.city}, {pg.state} · {pg.pincode}
            </p>
          </div>

          {pg.description ? (
            <p className="line-clamp-2 text-sm text-apg-silver/90">{pg.description}</p>
          ) : null}

          <AmenityList amenities={pg.amenities} />

          <div className="mt-auto flex items-end justify-between border-t border-white/5 pt-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-apg-silver">From</span>
              <p className="text-lg font-semibold text-white">
                {pg.startingFromPaise > 0 ? paiseToInr(pg.startingFromPaise) : '—'}
                <span className="ml-1 text-xs font-normal text-apg-silver">/mo</span>
              </p>
            </div>
            <span className="text-xs font-semibold text-[#FF5A1F] group-hover:translate-x-0.5 transition-transform">
              View beds →
            </span>
          </div>
        </div>
      </Link>
      {pg.hasPaymentEnabled && uploadScreenshot ? (
        <PgPaymentsPanel
          pgId={pg.id}
          pgName={pg.name}
          uploadScreenshot={uploadScreenshot}
        />
      ) : null}
    </motion.div>
  );
}
