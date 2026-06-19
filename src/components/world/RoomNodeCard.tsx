'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { paiseToInr } from '@/src/lib/format';
import {
  getRoomVisualSeed,
  resolveRoomNodeState,
  type RoomNodeState,
} from '@/src/lib/roomWorld/roomVisualSeed';
import { useRoomStore } from '@/src/stores/useRoomStore';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { WorldLayer } from '@/src/components/world/WorldLayer';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

export type RoomNodeData = CustomerRoomCard & {
  /** Future room image URL — layout stays stable when absent. */
  imageUrl?: string | null;
};

type Props = {
  room: RoomNodeData;
  pgId: string;
  pgSlug: string;
  index?: number;
  isSelected?: boolean;
};

function sharingLabel(capacity: number): string {
  return `${capacity}-sharing`;
}

const STATE_BORDER: Record<RoomNodeState, string> = {
  available: 'border-white/10 hover:border-apg-orange/40',
  selected: 'world-room-node--selected border-apg-cyan/50',
  locked: 'border-white/5 opacity-75 hover:border-white/15',
};

export function RoomNodeCard({
  room,
  pgId,
  pgSlug,
  index = 0,
  isSelected = false,
}: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const setSelectedFloor = useRoomStore((s) => s.setSelectedFloor);

  const allBooked = room.availableBeds === 0 && room.totalBeds > 0;
  const hasImage = Boolean(room.imageUrl);
  const visual = getRoomVisualSeed(room.roomId);
  const nodeState = resolveRoomNodeState({ isSelected, allBooked });
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

  function handleSelect() {
    setSelectedPg(pgId, pgSlug);
    setSelectedRoom(room.roomId, room.floorNumber);
    setSelectedFloor(room.floorNumber);
    router.push(
      `/pgs/${pgSlug}/rooms/${room.roomId}?floor=${room.floorNumber}`,
    );
  }

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
          reduced || nodeState === 'locked'
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
        <button
          type="button"
          onClick={handleSelect}
          data-roachie-focus="room-pick"
          aria-current={isSelected ? 'true' : undefined}
          aria-label={`Select room ${room.roomNumber}, ${sharingLabel(room.capacity)}, ${room.hasAc ? 'AC' : 'Non-AC'}`}
          className={
            'world-room-node group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border apg-glass text-left ' +
            STATE_BORDER[nodeState]
          }
          style={{
            boxShadow:
              nodeState === 'selected'
                ? `0 0 ${24 * visual.glowIntensity}px ${visual.glowColor}`
                : undefined,
          }}
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
              style={{ background: visual.gradient }}
            >
              <div
                className="world-room-node-noise absolute inset-0"
                style={{ opacity: visual.noiseOpacity }}
                aria-hidden
              />
              <div
                className="world-room-node-pattern absolute inset-0 opacity-30"
                style={{
                  backgroundSize: `${visual.patternScale}px ${visual.patternScale}px`,
                  backgroundImage: `radial-gradient(hsla(${visual.accentHue}, 70%, 60%, 0.15) 1px, transparent 1px)`,
                }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 30% 20%, ${visual.glowColor}, transparent 55%)`,
                }}
                aria-hidden
              />
              <div className="relative z-10 flex flex-col items-center gap-2 px-3 text-center">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    color: `hsla(${visual.accentHue}, 80%, 75%, 0.85)`,
                    border: `1px solid hsla(${visual.accentHue}, 50%, 50%, 0.35)`,
                    background: 'rgba(0,0,0,0.25)',
                  }}
                >
                  Node {visual.seed + 1}
                </span>
                <span className="text-3xl font-semibold tabular-nums text-white/95">
                  {room.roomNumber}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/45">
                  {room.floorLabel}
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
                {nodeState === 'selected' ? 'Selected ✓' : 'Enter →'}
              </span>
            </div>
          </div>

          {nodeState === 'selected' ? (
            <span
              className="world-room-node-aura pointer-events-none absolute -inset-px rounded-2xl"
              aria-hidden
            />
          ) : null}
        </button>
      </motion.div>
    </WorldLayer>
  );
}
