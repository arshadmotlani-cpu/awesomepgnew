'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PgCard, type PgCardData } from '@/src/components/customer/PgCard';
import { WorldLayer } from '@/src/components/world';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

/** Phase D — floating city grid for PG listings. */
export function SpatialPgGrid({
  pgs,
  uploadScreenshot,
}: {
  pgs: PgCardData[];
  uploadScreenshot?: (formData: FormData) => Promise<string>;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.ul
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
      className="world-pg-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {pgs.map((pg, i) => (
        <motion.li
          key={pg.id}
          variants={{
            hidden: reduced ? {} : { opacity: 0, y: 28, rotateX: 8 },
            show: {
              opacity: 1,
              y: 0,
              rotateX: 0,
              transition: { duration: 0.55, ease: WORLD_EASE.cinematic },
            },
          }}
          className="world-pg-block"
          style={{ perspective: reduced ? undefined : '800px' }}
        >
          <WorldLayer depth={i % 3 === 0 ? 2 : 1} float={i % 2 === 0}>
            <motion.div
              whileHover={
                reduced
                  ? undefined
                  : {
                      y: -8,
                      rotateY: 2,
                      rotateX: -2,
                      transition: { type: 'spring', stiffness: 280, damping: 22 },
                    }
              }
              className="world-float-card apg-elev-floating overflow-hidden rounded-2xl"
            >
              <PgCard pg={pg} uploadScreenshot={uploadScreenshot} />
            </motion.div>
          </WorldLayer>
        </motion.li>
      ))}
    </motion.ul>
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
