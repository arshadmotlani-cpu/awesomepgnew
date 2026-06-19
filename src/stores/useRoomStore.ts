'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RoomSelectionState = {
  selectedPgId: string | null;
  selectedPgSlug: string | null;
  selectedRoomId: string | null;
  selectedFloorId: number | null;

  setSelectedPg: (id: string, slug: string) => void;
  setSelectedRoom: (roomId: string, floorNumber: number) => void;
  setSelectedFloor: (floorNumber: number) => void;
  clearRoomSelection: () => void;
  syncFromRoute: (args: {
    pgId?: string | null;
    pgSlug?: string | null;
    roomId?: string | null;
    floorNumber?: number | null;
  }) => void;
};

export const useRoomStore = create<RoomSelectionState>()(
  persist(
    (set, get) => ({
      selectedPgId: null,
      selectedPgSlug: null,
      selectedRoomId: null,
      selectedFloorId: null,

      setSelectedPg: (id, slug) => {
        const prev = get().selectedPgId;
        if (prev && prev !== id) {
          set({
            selectedPgId: id,
            selectedPgSlug: slug,
            selectedRoomId: null,
            selectedFloorId: null,
          });
          return;
        }
        set({ selectedPgId: id, selectedPgSlug: slug });
      },

      setSelectedRoom: (roomId, floorNumber) => {
        set({ selectedRoomId: roomId, selectedFloorId: floorNumber });
      },

      setSelectedFloor: (floorNumber) => {
        set({ selectedFloorId: floorNumber });
      },

      clearRoomSelection: () => {
        set({ selectedRoomId: null, selectedFloorId: null });
      },

      syncFromRoute: ({ pgId, pgSlug, roomId, floorNumber }) => {
        const patch: Partial<RoomSelectionState> = {};
        if (pgId) patch.selectedPgId = pgId;
        if (pgSlug) patch.selectedPgSlug = pgSlug;
        if (roomId) patch.selectedRoomId = roomId;
        if (floorNumber != null) patch.selectedFloorId = floorNumber;
        if (Object.keys(patch).length > 0) set(patch);
      },
    }),
    {
      name: 'apg-room-selection',
      partialize: (state) => ({
        selectedPgId: state.selectedPgId,
        selectedPgSlug: state.selectedPgSlug,
        selectedRoomId: state.selectedRoomId,
        selectedFloorId: state.selectedFloorId,
      }),
    },
  ),
);

/** Non-hook access for imperative updates before navigation. */
export function getRoomSelectionSnapshot() {
  return useRoomStore.getState();
}
