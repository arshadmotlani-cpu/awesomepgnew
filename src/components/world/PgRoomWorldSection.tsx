'use client';

import { Suspense } from 'react';
import { PgDnaFloorFlow } from '@/src/components/world/PgDnaFloorFlow';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';
import { useRoomWorldUrlSync } from '@/src/lib/roomWorld/roomWorldFlow';

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: PgSpineRoom[];
};

function PgRoomWorldInner({ pgId, pgSlug, rooms }: Props) {
  useRoomWorldUrlSync(pgId, pgSlug);
  return <PgDnaFloorFlow pgId={pgId} pgSlug={pgSlug} rooms={rooms} />;
}

export function PgRoomWorldSection(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-2xl border border-white/10 apg-glass-light" />
      }
    >
      <PgRoomWorldInner {...props} />
    </Suspense>
  );
}
