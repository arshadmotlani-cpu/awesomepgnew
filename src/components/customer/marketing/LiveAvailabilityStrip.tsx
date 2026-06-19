'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CountUpNumber } from '@/src/components/customer/design-system';

type Props = {
  availableBeds: number;
  totalBeds: number;
  pgCount: number;
};

export function LiveAvailabilityStrip({ availableBeds, totalBeds, pgCount }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      className="mx-auto mt-10 w-full max-w-3xl"
      aria-live="polite"
    >
      <div className="apg-elev-floating apg-glass flex flex-col items-center gap-2 rounded-2xl px-6 py-4 sm:flex-row sm:justify-between">
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
    </motion.section>
  );
}
