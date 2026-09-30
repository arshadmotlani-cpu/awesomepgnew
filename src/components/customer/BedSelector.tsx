'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BedDnaGrid, BedDnaRipple } from '@/src/components/world/BedDnaGrid';
import { PublicBedTile } from '@/src/components/customer/PublicBedTile';
import { SharedBedPrompt } from '@/src/components/customer/SharedBedPrompt';
import { BedBookingPanel } from './BedBookingPanel';
import { BedReservePanel } from './BedReservePanel';
import { CustomerBedDetailSheet, canBookBed } from './customerBedUi';
import type { BedSelectorBed } from './customerBedTypes';
import {
  applySharedBedSelection,
  resolveSharedBedPrompt,
  type SharedBedCandidate,
} from '@/src/lib/booking/sharedBedPrompt';

export type { BedSelectorBed } from './customerBedTypes';

type Props = {
  beds: BedSelectorBed[];
  theme?: 'dark' | 'light';
  roomLabel?: string;
  pgName?: string;
  pgSlug: string;
  roomId: string;
  sharedBedId?: string | null;
};

function candidateFor(bed: BedSelectorBed): SharedBedCandidate {
  return {
    bedId: bed.bedId,
    bedCode: bed.bedCode,
    status: bed.status,
    bookable: canBookBed(bed),
    occupied: Boolean(bed.isOccupiedToday || bed.manualOccupied),
  };
}

export function BedSelector({
  beds,
  theme = 'light',
  roomLabel = 'This room',
  pgName,
  pgSlug,
  roomId,
  sharedBedId = null,
}: Props) {
  const dark = theme === 'dark';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailBedId, setDetailBedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelOptions, setPanelOptions] = useState<{
    shortStayOnly?: boolean;
    reserveCheckIn?: string;
  }>({});
  const [reservePanelBed, setReservePanelBed] = useState<BedSelectorBed | null>(null);
  const [interestOverrides, setInterestOverrides] = useState<Record<string, number>>({});
  const [rippleBedId, setRippleBedId] = useState<string | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);

  const mergeBed = useCallback(
    (bed: BedSelectorBed): BedSelectorBed => {
      const count = interestOverrides[bed.bedId];
      return count !== undefined ? { ...bed, noticeInterestCount: count } : bed;
    },
    [interestOverrides],
  );

  const handleNoticeInterestUpdate = useCallback((bedId: string, count: number) => {
    setInterestOverrides((prev) => ({ ...prev, [bedId]: count }));
  }, []);

  const detailBed = beds.find((b) => b.bedId === detailBedId);
  const detailBedView = detailBed ? mergeBed(detailBed) : null;

  const selectedBeds = useMemo(
    () => beds.filter((b) => selected.has(b.bedId)),
    [beds, selected],
  );

  const bookableCount = beds.filter((b) => canBookBed(b)).length;

  const prompt = useMemo(
    () =>
      resolveSharedBedPrompt({
        sharedBedId,
        dismissed: promptDismissed,
        roomLabel,
        beds: beds.map(candidateFor),
      }),
    [sharedBedId, promptDismissed, roomLabel, beds],
  );

  useEffect(() => {
    if (!sharedBedId) return;
    const el = document.querySelector(`[data-bed-id="${CSS.escape(sharedBedId)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sharedBedId]);

  function openPanelForBed(
    bedId: string,
    options?: { shortStayOnly?: boolean; reserveCheckIn?: string },
  ) {
    setPanelOptions(options ?? {});
    setSelected(new Set([bedId]));
    setDetailBedId(null);
    setPanelOpen(true);
  }

  function selectSharedBed() {
    const picked = applySharedBedSelection(prompt);
    if (!picked) return;
    setPromptDismissed(true);
    openPanelForBed(picked.bedId);
  }

  return (
    <>
      <div className="space-y-4">
        {beds.length > 0 ? (
          <BedDnaGrid>
            {beds.map((bed) => {
              const view = mergeBed(bed);
              return (
                <div key={bed.bedId} className="relative">
                  <PublicBedTile
                    bed={view}
                    isSelected={selected.has(bed.bedId)}
                    highlighted={sharedBedId === bed.bedId}
                    pgSlug={pgSlug}
                    roomId={roomId}
                    roomLabel={roomLabel}
                    onSelect={() => {
                      setDetailBedId(bed.bedId);
                      setRippleBedId(bed.bedId);
                      window.setTimeout(() => setRippleBedId(null), 650);
                    }}
                  />
                  <BedDnaRipple active={rippleBedId === bed.bedId} />
                </div>
              );
            })}
          </BedDnaGrid>
        ) : null}

        <div
          className={
            dark
              ? 'sticky bottom-4 z-10 rounded-2xl border border-white/10 apg-glass px-4 py-4 shadow-2xl'
              : 'sticky bottom-0 z-10 -mx-4 border-t border-zinc-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm'
          }
        >
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                {bookableCount} bed{bookableCount === 1 ? '' : 's'} bookable
              </p>
              <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                Tap a bed for details, rent, and booking
              </p>
            </div>
          </div>
        </div>
      </div>

      {detailBedView ? (
        <CustomerBedDetailSheet
          bed={detailBedView}
          pgName={pgName}
          roomLabel={roomLabel}
          onClose={() => setDetailBedId(null)}
          onBook={(options) => openPanelForBed(detailBedView.bedId, options)}
          onPreBook={() => openPanelForBed(detailBedView.bedId)}
          onReserve={() => {
            setReservePanelBed(detailBedView);
            setDetailBedId(null);
          }}
          onNoticeInterestUpdate={handleNoticeInterestUpdate}
        />
      ) : null}

      {panelOpen && selectedBeds.length > 0 ? (
        <BedBookingPanel
          beds={selectedBeds}
          theme={theme}
          onClose={() => setPanelOpen(false)}
          shortStayOnly={panelOptions.shortStayOnly}
          reserveCheckInDate={panelOptions.reserveCheckIn}
        />
      ) : null}

      {reservePanelBed ? (
        <BedReservePanel bed={reservePanelBed} onClose={() => setReservePanelBed(null)} />
      ) : null}

      {prompt.phase === 'open' ? (
        <SharedBedPrompt
          state={prompt}
          onClose={() => setPromptDismissed(true)}
          onSelect={selectSharedBed}
        />
      ) : null}
    </>
  );
}
