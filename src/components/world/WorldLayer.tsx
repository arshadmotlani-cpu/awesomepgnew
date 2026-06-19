'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { useParallaxDepth } from '@/src/components/world/useParallaxDepth';
import { DEPTH_Z_INDEX, type WorldDepth } from '@/src/components/world/worldMotion';

type Props = {
  depth?: WorldDepth;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  float?: boolean;
};

export function WorldLayer({
  depth = 1,
  children,
  className = '',
  style,
  float = false,
}: Props) {
  const parallax = useParallaxDepth(depth);
  const reduced = useReducedMotion();

  return (
    <motion.div
      data-depth={depth}
      className={`world-layer world-depth-${depth}${float ? ' world-float' : ''} ${className}`}
      style={{
        zIndex: DEPTH_Z_INDEX[depth],
        ...style,
        ...(reduced ? {} : { y: parallax.y }),
      }}
      {...(float && !reduced
        ? {
            animate: { y: [0, -8, 0] },
            transition: { duration: 6 + depth * 2, repeat: Infinity, ease: 'easeInOut' },
          }
        : {})}
    >
      {children}
    </motion.div>
  );
}
