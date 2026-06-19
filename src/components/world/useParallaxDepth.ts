'use client';

import { useMemo } from 'react';
import { DEPTH_PARALLAX_FACTOR, type WorldDepth } from '@/src/components/world/worldMotion';
import { useWorldScroll } from '@/src/components/world/WorldMotionProvider';

export function useParallaxDepth(depth: WorldDepth = 1) {
  const { scrollY, reducedMotion } = useWorldScroll();

  return useMemo(() => {
    if (reducedMotion) return { y: 0, scale: 1 };
    const factor = DEPTH_PARALLAX_FACTOR[depth];
    return {
      y: scrollY * factor * -1,
      scale: 1 + depth * 0.002,
    };
  }, [scrollY, depth, reducedMotion]);
}
