'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import {
  clampDistance,
  DNA_SPINE_ITEM_HEIGHT,
} from '@/src/lib/roomWorld/floorEngine';
import {
  occupancyRatio,
  roomAvailabilityLabel,
} from '@/src/lib/roomWorld/dnaSpineLayout';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';
import { getRoomVisualSeed } from '@/src/lib/roomWorld/roomVisualSeed';
import { usePgDnaStore } from '@/src/stores/usePgDnaStore';

type Props = {
  room: PgSpineRoom;
  index: number;
  fractionalIndex: number;
  velocity: number;
  itemHeight?: number;
  reducedMotion: boolean;
};

/** Physics room card — spring-driven spine with inertia tilt. */
export function PgRoomCardV3({
  room,
  index,
  fractionalIndex,
  velocity,
  itemHeight = DNA_SPINE_ITEM_HEIGHT,
  reducedMotion,
}: Props) {
  const expandRoom = usePgDnaStore((s) => s.expandRoom);
  const visual = getRoomVisualSeed(room.roomId);
  const floorColor = getFloorColor(room.floorNumber);
  const ratio = occupancyRatio(room);
  const status = roomAvailabilityLabel(room);

  const distance = clampDistance(index - fractionalIndex);
  const isActive = Math.abs(distance) < 0.45;

  const baseScale = isActive ? 1 : 0.86 - Math.min(Math.abs(distance), 3) * 0.02;
  const inertiaTilt = reducedMotion
    ? 0
    : Math.min(Math.max(velocity * 0.02, -15), 15);
  const rotateX = reducedMotion ? distance * -8 : distance * -18 + inertiaTilt;
  const translateY = reducedMotion ? distance * 40 : distance * 70 - velocity * 0.1;
  const translateZ = reducedMotion ? 0 : -Math.abs(distance) * 90;
  const opacity = 1 - Math.min(Math.abs(distance), 3) * 0.1;

  return (
    <motion.div
      className="dna-spine-v3-card absolute left-1/2 w-[92%] max-w-md -translate-x-1/2"
      style={{
        top: index * itemHeight,
        transformStyle: 'preserve-3d',
        zIndex: Math.round(20 - Math.abs(distance) * 4),
        opacity,
      }}
      animate={{
        scale: baseScale,
        rotateX,
        y: translateY,
        z: translateZ,
      }}
      transition={
        reducedMotion
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 140, damping: 22 }
      }
    >
      <button
        type="button"
        onClick={() => expandRoom(room.roomId)}
        className={
          'dna-spine-card group flex w-full items-stretch gap-3 overflow-hidden rounded-xl border apg-glass-light text-left ' +
          (isActive ? 'border-apg-orange/40 ring-1 ring-apg-orange/25' : 'border-white/10 hover:border-white/20')
        }
        aria-label={`Room ${room.roomNumber}, ${status}, tap for details`}
      >
        <div className="relative h-[4.5rem] w-[5.5rem] shrink-0 overflow-hidden sm:h-20 sm:w-24">
          {room.imageUrl ? (
            <Image src={room.imageUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white/80"
              style={{ background: visual.gradient }}
              aria-hidden
            >
              {room.roomNumber}
            </div>
          )}
          <span
            className="absolute bottom-1 left-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90"
            style={{ background: `${floorColor.accent}cc` }}
          >
            {room.floorLabel.split(' ')[0]}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-white sm:text-lg">
              Room {room.roomNumber}
            </h3>
            <span
              className={
                'shrink-0 text-[10px] font-semibold uppercase tracking-wide ' +
                (status === 'Full'
                  ? 'text-rose-300'
                  : status === 'Open'
                    ? 'text-emerald-300'
                    : 'text-apg-orange')
              }
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-apg-silver">
            {room.availableBeds}/{room.totalBeds} beds · {room.capacity}-sharing
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(ratio * 100)}%`,
                background: ratio > 0 ? floorColor.accent : 'rgba(248,113,113,0.7)',
              }}
            />
          </div>
        </div>
      </button>
    </motion.div>
  );
}
