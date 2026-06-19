'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RoomLightLayer } from '@/src/components/world/RoomLightLayer';
import { RoomNodeCard, type RoomNodeData } from '@/src/components/world/RoomNodeCard';
import { WorldLayer } from '@/src/components/world/WorldLayer';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

type Props = {
  rooms: RoomNodeData[];
  pgId: string;
  pgSlug: string;
  selectedRoomId?: string | null;
};

export function SpatialRoomGrid({ rooms, pgId, pgSlug, selectedRoomId = null }: Props) {
  const reduced = useReducedMotion();

  const floors = useMemo(() => {
    const map = new Map<
      number,
      { floorLabel: string; floorNumber: number; rooms: RoomNodeData[] }
    >();
    for (const room of rooms) {
      const key = room.floorNumber ?? 0;
      const existing = map.get(key) ?? {
        floorLabel: room.floorLabel,
        floorNumber: key,
        rooms: [],
      };
      existing.rooms.push(room);
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => a.floorNumber - b.floorNumber);
  }, [rooms]);

  if (rooms.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
        No rooms have been added to this PG yet.
      </p>
    );
  }

  let globalIndex = 0;

  return (
    <section className="world-room-world relative" aria-label="Room world">
      <RoomLightLayer />

      <WorldLayer depth={1} className="relative mb-6">
        <motion.header
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: WORLD_EASE.reveal }}
        >
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Room world</h2>
          <p className="mt-1 max-w-2xl text-sm text-apg-silver">
            Floating room nodes — tap a light box to enter and pick your bed.
          </p>
        </motion.header>
      </WorldLayer>

      <div className="relative space-y-10">
        {floors.map((floor) => (
          <div
            key={floor.floorNumber}
            id={`floor-${floor.floorNumber}`}
            className="scroll-mt-24"
          >
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-apg-orange/90">
              {floor.floorLabel}
              <span className="ml-2 font-normal text-apg-muted">
                · {floor.rooms.length} room{floor.rooms.length === 1 ? '' : 's'}
              </span>
            </p>

            <motion.ul
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: reduced ? 0 : 0.05 } },
              }}
              className={
                'world-room-grid grid gap-5 sm:gap-6 ' +
                (reduced
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')
              }
            >
              {floor.rooms.map((room) => {
                const idx = globalIndex;
                globalIndex += 1;
                return (
                  <motion.li
                    key={room.roomId}
                    variants={{
                      hidden: reduced ? {} : { opacity: 0, y: 20 },
                      show: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.45, ease: WORLD_EASE.cinematic },
                      },
                    }}
                    className={`world-room-grid-cell world-room-grid-cell--${idx % 3}`}
                  >
                    <RoomNodeCard
                      room={room}
                      pgId={pgId}
                      pgSlug={pgSlug}
                      index={idx}
                      isSelected={selectedRoomId === room.roomId}
                    />
                  </motion.li>
                );
              })}
            </motion.ul>
          </div>
        ))}
      </div>
    </section>
  );
}
