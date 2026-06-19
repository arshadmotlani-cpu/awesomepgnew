'use client';

import Image from 'next/image';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import {
  occupancyRatio,
  roomAvailabilityLabel,
  spineTransformForOffset,
} from '@/src/lib/roomWorld/dnaSpineLayout';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';
import { getRoomVisualSeed } from '@/src/lib/roomWorld/roomVisualSeed';

type Props = {
  room: PgSpineRoom;
  spineOffset: number;
  reducedMotion: boolean;
  onExpand: () => void;
};

/** Minimal overview card — poster/gradient only, no video autoplay. */
export function DnaSpineRoomCard({ room, spineOffset, reducedMotion, onExpand }: Props) {
  const visual = getRoomVisualSeed(room.roomId);
  const floorColor = getFloorColor(room.floorNumber);
  const tf = spineTransformForOffset(spineOffset, reducedMotion);
  const ratio = occupancyRatio(room);
  const status = roomAvailabilityLabel(room);
  const isActive = spineOffset === 0;

  return (
    <article
      className="dna-spine-item px-2 py-1.5"
      data-offset={spineOffset}
      style={{
        transform: `rotateX(${tf.rotateX}deg) scale(${tf.scale}) translateZ(${tf.translateZ}px)`,
        opacity: tf.opacity,
        zIndex: tf.zIndex,
      }}
    >
      <button
        type="button"
        onClick={onExpand}
        className={
          'dna-spine-card group flex w-full items-stretch gap-3 overflow-hidden rounded-xl border apg-glass-light text-left transition ' +
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
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(ratio * 100)}%`,
                background: ratio > 0 ? floorColor.accent : 'rgba(248,113,113,0.7)',
              }}
            />
          </div>
        </div>
      </button>
    </article>
  );
}
