'use client';

import { canBookBed } from '@/src/components/customer/customerBedUi';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { deriveCustomerBedAvailabilityView } from '@/src/lib/bedAvailabilityState';

type SlotState = 'available' | 'occupied' | 'selected';

function slotState(bed: BedSelectorBed, selected: boolean): SlotState {
  if (selected) return 'selected';
  const availability = deriveCustomerBedAvailabilityView({
    bedStatus: bed.status,
    isAvailableNow: bed.isAvailableNow,
    manualOccupied: bed.manualOccupied,
    nextAvailableDate: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    reservedFrom: bed.reservedFrom,
    activeBedReserveCheckIn: bed.activeBedReserveCheckIn,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
  });
  if (canBookBed(bed) || availability.kind === 'notice') return 'available';
  return 'occupied';
}

const TONE: Record<SlotState, string> = {
  available:
    'border-emerald-500/35 bg-emerald-500/12 text-emerald-50 hover:border-emerald-400/50 hover:bg-emerald-500/18',
  occupied:
    'border-white/8 bg-white/[0.04] text-apg-muted cursor-default',
  selected:
    'border-sky-400/60 bg-sky-500/20 text-sky-50 ring-2 ring-sky-400/40',
};

type Props = {
  bed: BedSelectorBed;
  selected?: boolean;
  onSelect: () => void;
};

/** Minimal bed chip — code only, green / grey / blue. Details live in the bottom sheet. */
export function PgCompactBedSlot({ bed, selected, onSelect }: Props) {
  const state = slotState(bed, Boolean(selected));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Bed ${bed.bedCode}`}
      className={
        'flex min-h-[48px] w-full items-center justify-center rounded-[14px] border text-[13px] font-semibold tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange/60 disabled:opacity-70 ' +
        TONE[state]
      }
    >
      {bed.bedCode}
    </button>
  );
}
