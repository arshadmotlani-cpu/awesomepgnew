'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PgCard, type PgCardData } from '@/src/components/customer/PgCard';
import { WorldLayer } from '@/src/components/world';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

/** Browse listing grid — normal document flow (no parallax / float transforms). */
export function SpatialPgGrid({
  pgs,
  uploadScreenshot,
}: {
  pgs: PgCardData[];
  uploadScreenshot?: (formData: FormData) => Promise<string>;
}) {
  const reduced = useReducedMotion();

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {pgs.map((pg, i) => (
        <li key={pg.id} className="min-w-0">
          {reduced ? (
            <PgCard pg={pg} uploadScreenshot={uploadScreenshot} />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: Math.min(i * 0.05, 0.25),
                ease: WORLD_EASE.reveal,
              }}
            >
              <PgCard pg={pg} uploadScreenshot={uploadScreenshot} />
            </motion.div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SpatialPgHeader({ children }: { children: ReactNode }) {
  return (
    <WorldLayer depth={1} className="mb-8">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: WORLD_EASE.reveal }}
      >
        {children}
      </motion.header>
    </WorldLayer>
  );
}
