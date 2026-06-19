'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

type Props = {
  children: ReactNode;
  className?: string;
  onRipple?: () => void;
};

/** Phase E — DNA cellular bed grid wrapper with ripple propagation. */
export function BedDnaGrid({ children, className = '', onRipple }: Props) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`world-bed-dna grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 ${className}`}
      data-roachie-focus="bed-pick"
      data-roachie-tour="bed-grid"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: WORLD_EASE.cinematic }}
      onClick={onRipple}
    >
      {children}
    </motion.div>
  );
}

export function BedDnaRipple({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  if (!active || reduced) return null;

  return (
    <motion.span
      className="pointer-events-none absolute inset-0 rounded-xl border-2 border-apg-cyan/50"
      initial={{ scale: 0.85, opacity: 0.8 }}
      animate={{ scale: 1.15, opacity: 0 }}
      transition={{ duration: 0.6, ease: WORLD_EASE.snap }}
      aria-hidden
    />
  );
}
