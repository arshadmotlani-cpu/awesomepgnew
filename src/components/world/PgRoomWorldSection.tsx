'use client';

import { Suspense } from 'react';
import { SpatialRoomGrid } from '@/src/components/world/SpatialRoomGrid';
import type { RoomNodeData } from '@/src/components/world/RoomNodeCard';
import { useRoomWorldUrlSync } from '@/src/lib/roomWorld/roomWorldFlow';
import { useRoomStore } from '@/src/stores/useRoomStore';

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: RoomNodeData[];
};

function PgRoomWorldInner({ pgId, pgSlug, rooms }: Props) {
  useRoomWorldUrlSync(pgId, pgSlug);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);

  return <SpatialRoomGrid rooms={rooms} pgSlug={pgSlug} pgId={pgId} selectedRoomId={selectedRoomId} />;
}

export function PgRoomWorldSection(props: Props) {
  return (
    <Suspense fallback={<SpatialRoomGrid {...props} selectedRoomId={null} />}>
      <PgRoomWorldInner {...props} />
    </Suspense>
  );
}
