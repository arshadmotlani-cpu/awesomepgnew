'use client';

import { useReducedMotion } from 'framer-motion';

/** Scoped ambient glow for the room world layer — CSS only. */
export function RoomLightLayer() {
  const reduced = useReducedMotion();

  return (
    <div
      className="world-room-light pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
      aria-hidden
    >
      <div
        className={
          'world-room-light-orb world-room-light-orb-a' +
          (reduced ? ' world-room-light-static' : '')
        }
      />
      <div
        className={
          'world-room-light-orb world-room-light-orb-b' +
          (reduced ? ' world-room-light-static' : '')
        }
      />
      <div className="world-room-light-grid" />
    </div>
  );
}
