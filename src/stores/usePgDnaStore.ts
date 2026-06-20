'use client';

import { create } from 'zustand';

type PgDnaState = {
  expandedRoomId: string | null;
  expandRoom: (roomId: string) => void;
  closeRoom: () => void;
};

/** Spine expand intent — overview tap opens detail sheet. */
export const usePgDnaStore = create<PgDnaState>((set) => ({
  expandedRoomId: null,
  expandRoom: (roomId) => set({ expandedRoomId: roomId }),
  closeRoom: () => set({ expandedRoomId: null }),
}));
