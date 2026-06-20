'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  DNA_SPINE_ITEM_HEIGHT,
  fractionalActiveIndex,
} from '@/src/lib/roomWorld/floorEngine';

export type DnaPhysicsScrollState = {
  offset: number;
  velocity: number;
  activeIndex: number;
  fractionalIndex: number;
  viewportHeight: number;
};

/**
 * Physics scroll engine — scroll position drives a velocity field;
 * rooms react to momentum (inertia) instead of index snapping.
 */
export function useDnaPhysicsScroll(
  containerRef: RefObject<HTMLElement | null>,
  itemHeight = DNA_SPINE_ITEM_HEIGHT,
): DnaPhysicsScrollState {
  const velocityRef = useRef(0);
  const lastScrollRef = useRef(0);
  const [state, setState] = useState<DnaPhysicsScrollState>({
    offset: 0,
    velocity: 0,
    activeIndex: 0,
    fractionalIndex: 0,
    viewportHeight: 0,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;

    const measure = () => {
      const current = el.scrollTop;
      const v = current - lastScrollRef.current;
      lastScrollRef.current = current;
      velocityRef.current = v;

      const viewportHeight = el.clientHeight;
      const frac = fractionalActiveIndex(current, viewportHeight, itemHeight, 48);
      const activeIndex = Math.round(frac);

      setState({
        offset: current,
        velocity: v,
        activeIndex,
        fractionalIndex: frac,
        viewportHeight,
      });
    };

    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, itemHeight]);

  return state;
}
