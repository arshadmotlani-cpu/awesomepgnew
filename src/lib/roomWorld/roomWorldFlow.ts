'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRoomStore } from '@/src/stores/useRoomStore';

/** Keep URL query params in sync with room selection (survives refresh). */
export function useRoomWorldUrlSync(pgId: string, pgSlug: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const syncFromRoute = useRoomStore((s) => s.syncFromRoute);
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const selectedFloorId = useRoomStore((s) => s.selectedFloorId);

  useEffect(() => {
    setSelectedPg(pgId, pgSlug);
  }, [pgId, pgSlug, setSelectedPg]);

  useEffect(() => {
    const roomId = searchParams.get('roomId');
    const floor = searchParams.get('floor');
    syncFromRoute({
      pgId,
      pgSlug,
      roomId,
      floorNumber: floor != null && floor !== '' ? Number(floor) : null,
    });
  }, [searchParams, pgId, pgSlug, syncFromRoute]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (selectedRoomId) {
      if (params.get('roomId') !== selectedRoomId) {
        params.set('roomId', selectedRoomId);
        changed = true;
      }
    } else if (params.has('roomId')) {
      params.delete('roomId');
      changed = true;
    }

    if (selectedFloorId != null) {
      const floorStr = String(selectedFloorId);
      if (params.get('floor') !== floorStr) {
        params.set('floor', floorStr);
        changed = true;
      }
    } else if (params.has('floor')) {
      params.delete('floor');
      changed = true;
    }

    if (changed) {
      const qs = params.toString();
      router.replace(qs ? `/pgs/${pgSlug}?${qs}` : `/pgs/${pgSlug}`, { scroll: false });
    }
  }, [selectedRoomId, selectedFloorId, pgSlug, router, searchParams]);
}

/** Room detail page — hydrate store from route (URL is source of truth on this page). */
export function useRoomDetailFlowGuard(args: {
  pgId: string;
  pgSlug: string;
  roomId: string;
  floorNumber: number;
}) {
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const syncFromRoute = useRoomStore((s) => s.syncFromRoute);

  useEffect(() => {
    setSelectedPg(args.pgId, args.pgSlug);
    setSelectedRoom(args.roomId, args.floorNumber);
    syncFromRoute({
      pgId: args.pgId,
      pgSlug: args.pgSlug,
      roomId: args.roomId,
      floorNumber: args.floorNumber,
    });
  }, [
    args.pgId,
    args.pgSlug,
    args.roomId,
    args.floorNumber,
    setSelectedPg,
    setSelectedRoom,
    syncFromRoute,
  ]);
}
