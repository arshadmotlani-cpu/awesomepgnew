'use client';

import { useState } from 'react';
import { RoomIntegrityBadge } from '@/src/components/admin/RoomIntegrityBadge';
import { RoomBedsDrawer } from '@/src/components/admin/rooms/RoomBedsDrawer';
import { RoomListingDetailsPanel } from '@/src/components/admin/rooms/RoomListingDetailsPanel';
import { RoomRentEditorDialog } from '@/src/components/admin/rooms/RoomRentEditorDialog';
import { RoomTypeChangeDialog } from '@/src/components/admin/rooms/RoomTypeChangeDialog';
import {
  bedStatusLabel,
  bedStatusTone,
  formatRentSummary,
  ratesFromBeds,
  type RoomRateSnapshot,
} from '@/src/components/admin/rooms/roomCardFormatters';
import { paiseToInr } from '@/src/lib/format';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import type { RoomExitQueueItem } from '@/src/lib/exit/loadRoomExitQueue';
import type { RoomDimensions } from '@/src/lib/roomListing';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { formatDate } from '@/src/lib/format';

type MoveTarget = { roomId: string; label: string };

export type RoomOperationalCardProps = {
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  roomTypeName: string;
  hasAc: boolean;
  roomNotes: string | null;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  blobUploadConfigured?: boolean;
  beds: PgInventoryBedRow[];
  integrity?: RoomIntegrityResult;
  moveTargets: MoveTarget[];
  exitQueue?: RoomExitQueueItem[];
  rateOverride?: RoomRateSnapshot | null;
  onRateSaved: (roomId: string, rates: RoomRateSnapshot) => void;
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomOperationalCard({
  pgId,
  roomId,
  roomNumber,
  floorLabel,
  roomTypeName,
  hasAc,
  roomNotes,
  listingDescription,
  images,
  videos,
  dimensions,
  blobUploadConfigured = false,
  beds,
  integrity,
  moveTargets,
  exitQueue,
  rateOverride,
  onRateSaved,
  onToast,
  floorNumber,
}: RoomOperationalCardProps) {
  const [rentOpen, setRentOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [bedsOpen, setBedsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const baseRates = ratesFromBeds(beds);
  const rates = rateOverride ?? baseRates;
  const occupied = integrity?.occupiedBeds ?? 0;
  const capacity = integrity?.physicalBeds ?? beds.length;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      {exitQueue?.length ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm">
          <p className="font-medium text-amber-100">Leaving soon</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
            {exitQueue.map((item) => (
              <li key={item.bookingId}>
                {item.customerName} · {formatDate(item.expectedCheckoutDate)} ·{' '}
                {item.lifecycleLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-white">
              Room {roomNumber}
              <span className="ml-2 text-sm font-normal text-zinc-500">{floorLabel}</span>
            </h4>
            <RoomIntegrityBadge integrity={integrity} />
          </div>
          <p className="text-sm text-zinc-400">
            {roomTypeName}
            {hasAc ? ' · AC' : ''}
            {' · '}
            {beds.length} bed{beds.length === 1 ? '' : 's'}
          </p>
          {rates ? (
            <p className="text-sm text-zinc-300">
              Rent: {formatRentSummary(rates)}
            </p>
          ) : null}
          <p className="text-sm text-zinc-500">
            Occupancy: {occupied}/{capacity}
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {beds.map((bed) => (
              <li key={bed.bedId} className={bedStatusTone(bed.bedStatus)}>
                {bed.bedCode} — {bedStatusLabel(bed.bedStatus)}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => setRentOpen(true)}>Edit rent</ActionButton>
          <ActionButton onClick={() => setTypeOpen(true)}>Change type</ActionButton>
          <ActionButton onClick={() => setBedsOpen(true)}>Manage beds</ActionButton>
          <div className="relative">
            <ActionButton onClick={() => setMoreOpen((v) => !v)}>More</ActionButton>
            {moreOpen ? (
              <div
                className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                onClick={() => setMoreOpen(false)}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setDetailsOpen(true)}
                >
                  Room details
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {rentOpen ? (
        <RoomRentEditorDialog
          open
          onClose={() => setRentOpen(false)}
          pgId={pgId}
          roomId={roomId}
          roomNumber={roomNumber}
          floorLabel={floorLabel}
          beds={beds}
          onSaved={(rates) => onRateSaved(roomId, rates)}
          onToast={onToast}
        />
      ) : null}
      {typeOpen ? (
        <RoomTypeChangeDialog
          open
          onClose={() => setTypeOpen(false)}
          pgId={pgId}
          roomId={roomId}
          roomNumber={roomNumber}
          roomTypeName={roomTypeName}
          beds={beds}
          integrity={integrity}
          onToast={onToast}
        />
      ) : null}
      {bedsOpen ? (
        <RoomBedsDrawer
          open
          onClose={() => setBedsOpen(false)}
          pgId={pgId}
          roomId={roomId}
          roomNumber={roomNumber}
          beds={beds}
          moveTargets={moveTargets}
          onToast={onToast}
        />
      ) : null}
      {detailsOpen ? (
        <RoomListingDetailsPanel
          open
          onClose={() => setDetailsOpen(false)}
          pgId={pgId}
          roomId={roomId}
          roomNumber={roomNumber}
          floorNumber={floorNumber}
          floorLabel={floorLabel}
          hasAc={hasAc}
          roomNotes={roomNotes}
          listingDescription={listingDescription}
          images={images}
          videos={videos}
          dimensions={dimensions}
          blobUploadConfigured={blobUploadConfigured}
          onToast={onToast}
        />
      ) : null}
    </article>
  );
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

/** Compact rent line for pricing table */
export function roomMonthlyRentDisplay(
  beds: PgInventoryBedRow[],
  override?: RoomRateSnapshot | null,
): string {
  const rates = override ?? ratesFromBeds(beds);
  if (!rates) return '—';
  return paiseToInr(rates.monthlyPaise);
}
