'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { paiseToInr } from '@/src/lib/format';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { WorldLayer } from '@/src/components/world/WorldLayer';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

export type RoomNodeData = CustomerRoomCard & {
  /** Future room image URL — layout stays stable when absent. */
  imageUrl?: string | null;
};

type Props = {
  room: RoomNodeData;
  pgSlug: string;
  index?: number;
  isSelected?: boolean;
};

function sharingLabel(capacity: number): string {
  return `${capacity}-sharing`;
}

function placeholderHue(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1) {
    hash = roomId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function RoomNodeCard({ room, pgSlug, index = 0, isSelected = false }: Props) {
  const reduced = useReducedMotion();
  const href = `/pgs/${pgSlug}/rooms/${room.roomId}`;
  const allBooked = room.availableBeds === 0 && room.totalBeds > 0;
  const hasImage = Boolean(room.imageUrl);
  const hue = placeholderHue(room.roomId);
  const depth = (index % 3) as 0 | 1 | 2;
  const float = !reduced && index % 2 === 0;

  const monthlyPrice =
    room.monthlyRatePaise > 0
      ? paiseToInr(room.monthlyRatePaise)
      : room.weeklyRatePaise > 0
        ? paiseToInr(room.weeklyRatePaise)
        : room.dailyRatePaise > 0
          ? paiseToInr(room.dailyRatePaise)
          : '—';

  const pricePeriod =
    room.monthlyRatePaise > 0 ? '/mo' : room.weeklyRatePaise > 0 ? '/wk' : '/day';

  return (
    <WorldLayer depth={depth} float={float} className="world-room-node-wrap h-full">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.55,
          delay: reduced ? 0 : (index % 6) * 0.06,
          ease: WORLD_EASE.cinematic,
        }}
        whileHover={
          reduced
            ? undefined
            : {
                scale: 1.04,
                y: -6,
                transition: { type: 'spring', stiffness: 320, damping: 22 },
              }
        }
        whileTap={
          reduced
            ? undefined
            : {
                scale: 0.98,
                transition: { duration: 0.12 },
              }
        }
        className="h-full"
      >
        <Link
          href={href}
          data-roachie-focus="room-pick"
          aria-current={isSelected ? 'page' : undefined}
          className={
            'world-room-node group relative flex h-full flex-col overflow-hidden rounded-2xl border apg-glass ' +
            (isSelected
              ? 'world-room-node--selected border-apg-cyan/50'
              : 'border-white/10 hover:border-apg-orange/40') +
            (allBooked ? ' opacity-80' : '')
          }
        >
          {!reduced ? (
            <span
              className="world-room-node-pulse pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-active:opacity-100"
              aria-hidden
            />
          ) : null}

          <div className="world-room-node-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
            <span className="world-room-node-sweep-bar" />
          </div>

          <div className="relative aspect-[4/3] w-full overflow-hidden">
            {hasImage ? (
              <Image
                src={room.imageUrl!}
                alt={`Room ${room.roomNumber}`}
                fill
                sizes="(max-width: 640px) 100vw, 280px"
                className="world-room-node-image object-cover opacity-0 transition-opacity duration-500 [animation-fill-mode:forwards]"
                onLoad={(e) => {
                  e.currentTarget.classList.remove('opacity-0');
                  e.currentTarget.classList.add('opacity-100');
                }}
              />
            ) : null}
            <div
              className={
                'world-room-node-placeholder absolute inset-0 flex flex-col items-center justify-center ' +
                (hasImage ? 'opacity-0' : 'opacity-100')
              }
              style={{
                background: `linear-gradient(145deg, hsla(${hue}, 55%, 18%, 0.95) 0%, hsla(${(hue + 40) % 360}, 45%, 12%, 0.98) 55%, rgba(8, 12, 22, 1) 100%)`,
              }}
            >
              <div className="world-room-node-noise absolute inset-0 opacity-40" aria-hidden />
              <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 text-center">
                <span className="rounded-full border border-dashed border-white/20 bg-black/20 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  Image slot
                </span>
                <span className="text-2xl font-semibold tabular-nums text-white/90">
                  {room.roomNumber}
                </span>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
            <span
              className={
                'absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset backdrop-blur-sm ' +
                (allBooked
                  ? 'bg-white/10 text-apg-muted ring-white/15'
                  : 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/35')
              }
            >
              {allBooked
                ? 'Occupied'
                : `${room.availableBeds}/${room.totalBeds} free`}
            </span>
          </div>

          <div className="relative flex flex-1 flex-col gap-2 p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-orange">
                {room.floorLabel}
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-white">
                Room {room.roomNumber}
              </h3>
              <p className="mt-0.5 text-xs text-apg-silver">
                {sharingLabel(room.capacity)} · {room.hasAc ? 'AC' : 'Non-AC'}
              </p>
            </div>

            <div className="mt-auto flex items-end justify-between gap-2 border-t border-white/5 pt-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-apg-muted">From</p>
                <p className="text-sm font-semibold text-white">
                  {monthlyPrice}
                  <span className="text-xs font-normal text-apg-silver">{pricePeriod}</span>
                </p>
              </div>
              <span className="text-xs font-semibold text-apg-cyan transition-transform group-hover:translate-x-0.5 group-hover:text-apg-orange">
                Enter →
              </span>
            </div>
          </div>

          {isSelected ? (
            <span
              className="world-room-node-aura pointer-events-none absolute -inset-px rounded-2xl"
              aria-hidden
            />
          ) : null}
        </Link>
      </motion.div>
    </WorldLayer>
  );
}
