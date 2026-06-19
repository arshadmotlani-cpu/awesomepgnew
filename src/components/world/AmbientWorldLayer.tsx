'use client';

import { useReducedMotion } from 'framer-motion';
import { useWorldScroll } from '@/src/components/world/WorldMotionProvider';

/** Lightweight ambient depth field — CSS only, no WebGL. */
export function AmbientWorldLayer() {
  const { scrollProgress, reducedMotion } = useWorldScroll();

  if (reducedMotion) {
    return (
      <div className="world-ambient-static pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="world-ambient-orb world-ambient-orb-a world-ambient-static-orb" />
        <div className="world-ambient-orb world-ambient-orb-b world-ambient-static-orb" />
        <div className="world-ambient-orb world-ambient-orb-c world-ambient-static-orb" />
      </div>
    );
  }

  const driftX = scrollProgress * 12;
  const driftY = scrollProgress * -8;

  return (
    <div
      className="world-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
      style={{
        transform: `translate3d(${driftX}px, ${driftY}px, 0)`,
      }}
    >
      <div className="world-ambient-orb world-ambient-orb-a" />
      <div className="world-ambient-orb world-ambient-orb-b" />
      <div className="world-ambient-orb world-ambient-orb-c" />
      <div className="world-ambient-particles" />
    </div>
  );
}
