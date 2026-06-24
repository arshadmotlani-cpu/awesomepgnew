'use client';

import { CountUpNumber } from '@/src/components/customer/design-system';

type Props = {
  availableBeds: number;
  totalBeds: number;
  pgCount: number;
};

export function LiveAvailabilityStrip({ availableBeds, totalBeds, pgCount }: Props) {
  return (
    <section className="mx-auto w-full max-w-3xl" aria-live="polite">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 sm:flex-row sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-200">
            Live availability
          </span>
        </div>
        <p className="text-center text-sm text-apg-silver sm:text-left">
          <CountUpNumber
            value={availableBeds}
            className="text-lg font-bold text-white"
          />{' '}
          premium beds available right now across{' '}
          <span className="font-semibold text-white">{pgCount}</span> properties
          {totalBeds > 0 ? (
            <>
              {' '}
              ·{' '}
              <span className="tabular-nums text-apg-silver">
                {totalBeds} total beds tracked
              </span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
