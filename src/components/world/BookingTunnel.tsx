'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { WorldSection } from '@/src/components/world';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

type Props = {
  children: ReactNode;
  step?: number;
  totalSteps?: number;
  title?: string;
};

/** Phase F — scroll descent checkpoint for booking flow. */
export function BookingTunnel({ children, step = 1, totalSteps = 3, title }: Props) {
  const reduced = useReducedMotion();
  const depth = (step / totalSteps) * 100;

  return (
    <WorldSection
      id={`booking-step-${step}`}
      checkpoint
      className="world-booking-tunnel relative"
    >
      {!reduced ? (
        <motion.div
          className="world-booking-depth pointer-events-none absolute inset-x-0 top-0 h-1 origin-left bg-gradient-to-r from-apg-orange via-apg-cyan to-apg-violet"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: depth / 100 }}
          transition={{ duration: 0.8, ease: WORLD_EASE.cinematic }}
          aria-hidden
        />
      ) : null}
      {title ? (
        <motion.p
          className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan"
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Step {step} of {totalSteps} · {title}
        </motion.p>
      ) : null}
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.98, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.65, ease: WORLD_EASE.reveal }}
      >
        {children}
      </motion.div>
    </WorldSection>
  );
}

export function BookingConvergence({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="world-booking-convergence mx-auto max-w-lg text-center"
      initial={reduced ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, ease: WORLD_EASE.reveal }}
    >
      <div className="world-hero-glow mx-auto mb-6 h-24 w-24 rounded-full blur-2xl" aria-hidden />
      {children}
    </motion.div>
  );
}
