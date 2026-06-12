'use client';

import { useMemo, useState, useCallback } from 'react';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';
import { BookingEducationBar } from './BookingEducationBar';
import { BedBookingPanel } from './BedBookingPanel';
import { BedReservePanel } from './BedReservePanel';
import { CustomerBedDetailSheet, CustomerBedTile, canBookBed } from './customerBedUi';
import { RoachieTourDemoBeds } from './RoachieTourDemoBeds';
import type { BedSelectorBed } from './customerBedTypes';

export type { BedSelectorBed } from './customerBedTypes';

type TourRole = 'bed-available' | 'bed-notice' | 'bed-capped' | null;

type Props = {
  beds: BedSelectorBed[];
  theme?: 'dark' | 'light';
  roomLabel?: string;
};

function assignTourRoles(beds: BedSelectorBed[]): Map<string, TourRole> {
  const roles = new Map<string, TourRole>();
  let hasAvailable = false;
  let hasNotice = false;
  let hasCapped = false;

  for (const bed of beds) {
    if (bed.status !== 'available') continue;
    if (!hasAvailable && bed.isAvailableNow) {
      roles.set(bed.bedId, 'bed-available');
      hasAvailable = true;
      continue;
    }
    if (!hasNotice && !bed.isAvailableNow && bed.nextAvailableDate && bed.vacatingDate) {
      roles.set(bed.bedId, 'bed-notice');
      hasNotice = true;
      continue;
    }
    if (!hasCapped && bed.availableUntilDate) {
      roles.set(bed.bedId, 'bed-capped');
      hasCapped = true;
    }
  }
  return roles;
}

export function BedSelector({ beds, theme = 'light', roomLabel = 'This room' }: Props) {
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

  const tourRoles = useMemo(() => assignTourRoles(beds), [beds]);
  const detailBed = beds.find((b) => b.bedId === detailBedId);
  const detailBedView = detailBed ? mergeBed(detailBed) : null;

  const selectedBeds = useMemo(
    () => beds.filter((b) => selected.has(b.bedId)),
    [beds, selected],
  );

  const sampleBed = beds.find((b) => b.monthlyRatePaise > 0) ?? beds[0];
  const bookableCount = beds.filter((b) => canBookBed(b)).length;

  function openPanelForBed(
    bedId: string,
    options?: { shortStayOnly?: boolean; reserveCheckIn?: string },
  ) {
    setPanelOptions(options ?? {});
    setSelected(new Set([bedId]));
    setDetailBedId(null);
    setPanelOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3"
          data-roachie-focus="bed-pick"
          data-roachie-tour="bed-grid"
        >
          {beds.map((bed) => {
            const tourRole = tourRoles.get(bed.bedId) ?? null;
            return (
              <div key={bed.bedId} {...(tourRole ? { 'data-roachie-tour': tourRole } : {})}>
                <CustomerBedTile
                  bed={mergeBed(bed)}
                  isSelected={selected.has(bed.bedId)}
                  onSelect={() => setDetailBedId(bed.bedId)}
                />
              </div>
            );
          })}
        </div>

        <RoachieTourDemoBeds
          showNotice={![...tourRoles.values()].includes('bed-notice')}
          showCapped={![...tourRoles.values()].includes('bed-capped')}
          theme={theme}
        />

        <BookingEducationBar
          theme={theme}
          sampleMonthlyPaise={sampleBed?.monthlyRatePaise || 12_000_00}
          sampleDepositPaise={
            sampleBed?.monthlySecurityDepositPaise ||
            sampleBed?.securityDepositPaise ||
            5_000_00
          }
        />

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
          roomLabel={roomLabel}
          onClose={() => setDetailBedId(null)}
          onBook={(options) => openPanelForBed(detailBedView.bedId, options)}
          onPreBook={() => {
            dispatchRoachieReminder('pre-book');
            openPanelForBed(detailBedView.bedId);
          }}
          onReserve={() => {
            dispatchRoachieReminder('reserve');
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
    </>
  );
}
