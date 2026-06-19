'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { CustomerBedTile } from '@/src/components/customer/customerBedUi';
import { RoomTheaterVideo } from '@/src/components/world/RoomTheaterVideo';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';

type Props = {
  room: PgSpineRoom;
  pgSlug: string;
  open: boolean;
  onClose: () => void;
  onSelectBed: (bedId: string) => void;
  selectedBedId: string | null;
};

/** Immersive expand view — video + beds load only on user intent. */
export function RoomDetailSheet({
  room,
  pgSlug,
  open,
  onClose,
  onSelectBed,
  selectedBedId,
}: Props) {
  const [mountedVideo, setMountedVideo] = useState(false);
  const floorColor = getFloorColor(room.floorNumber);

  useEffect(() => {
    if (open) setMountedVideo(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dna-room-sheet fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        aria-label="Close room details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dna-room-sheet-title"
        className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/15 apg-glass sm:rounded-2xl"
        style={{ boxShadow: `0 -8px 48px ${floorColor.glow}` }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: floorColor.accent }}
            >
              {room.floorLabel}
            </p>
            <h2 id="dna-room-sheet-title" className="text-lg font-semibold text-white">
              Room {room.roomNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-apg-silver hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain">
          {mountedVideo ? (
            <RoomTheaterVideo
              roomId={room.roomId}
              roomNumber={room.roomNumber}
              floorLabel={room.floorLabel}
              imageUrl={room.imageUrl}
              videoUrl={room.videoUrl}
            />
          ) : null}

          <div className="space-y-4 p-4">
            <p className="text-sm text-apg-silver">
              {room.roomType} · {room.capacity}-sharing · {room.hasAc ? 'AC' : 'Non-AC'} ·{' '}
              {room.availableBeds}/{room.totalBeds} beds free
            </p>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                Pick a bed
              </p>
              {room.beds.length === 0 ? (
                <p className="text-sm text-apg-muted">No beds configured yet.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                  {room.beds.map((bed: BedSelectorBed) => (
                    <CustomerBedTile
                      key={bed.bedId}
                      bed={bed}
                      isSelected={selectedBedId === bed.bedId}
                      onSelect={() => onSelectBed(bed.bedId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
          <p className="text-xs text-apg-muted">
            {selectedBedId ? 'Ready to continue' : 'Select a bed below'}
          </p>
          {selectedBedId ? (
            <Link
              href={`/pgs/${pgSlug}/rooms/${room.roomId}?bed=${selectedBedId}#bed-selector`}
              className="rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white apg-glow-btn hover:brightness-110"
            >
              Continue →
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-apg-muted"
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
