'use client';

import { Suspense } from 'react';
import { RoomTheater, type RoomTheaterRoom } from '@/src/components/world/RoomTheater';
import { useRoomWorldUrlSync } from '@/src/lib/roomWorld/roomWorldFlow';
import { useRoomStore } from '@/src/stores/useRoomStore';

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: RoomTheaterRoom[];
};

function PgRoomWorldInner({ pgId, pgSlug, rooms }: Props) {
  useRoomWorldUrlSync(pgId, pgSlug);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);

  return (
    <RoomTheater
      pgId={pgId}
      pgSlug={pgSlug}
      rooms={rooms}
      initialRoomId={selectedRoomId}
    />
  );
}

export function PgRoomWorldSection(props: Props) {
  return (
    <Suspense
      fallback={
        <RoomTheater {...props} initialRoomId={null} />
      }
    >
      <PgRoomWorldInner {...props} />
    </Suspense>
  );
}
