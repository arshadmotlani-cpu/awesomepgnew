'use client';

import Link from 'next/link';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { BedMapRemoveTenantButton } from '@/src/components/admin/BedMapRemoveTenantButton';
import { BedMapManualOccupiedToggle } from '@/src/components/admin/BedMapManualOccupiedToggle';
import { BedMapManualReservedToggle } from '@/src/components/admin/BedMapManualReservedToggle';
import { AdminVacatingSubmitForm } from '@/src/components/admin/AdminVacatingSubmitForm';
import { BedMapMoveForm } from '@/src/components/admin/BedMapMoveForm';
import { BedMapReservationForm } from '@/src/components/admin/BedMapReservationForm';
import {
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { PgBedMapBed, PgBedMapFloor, PgBedMapRoom } from '@/src/services/pgBedMap';

type BedOption = { bedId: string; label: string };

export function BedDetailAdvancedTools({
  bed,
  room,
  floor,
  pgId,
  moveBedOptions,
}: {
  bed: PgBedMapBed;
  room: PgBedMapRoom;
  floor: PgBedMapFloor;
  pgId: string;
  moveBedOptions: BedOption[];
}) {
  const person = bed.occupant ?? bed.reserved;

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Change bed, reservations, manual website status, or cancel move-out."
      defaultOpen={false}
      className="!mb-0 border-0 bg-transparent"
    >
      <div id="bed-advanced" className="space-y-4">
        {person && bed.occupant ? (
          <>
            <div id="start-move-out">
              {!bed.vacating ? (
                <AdminVacatingSubmitForm
                  pgId={pgId}
                  bookingId={person.bookingId}
                  monthlyRentPaise={person.monthlyRentPaise}
                  hasExistingVacating={Boolean(bed.vacating)}
                />
              ) : null}
            </div>

            {bed.vacating ? (
              <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-3">
                <p className="text-xs font-semibold text-orange-200">
                  Move-out · leaves {formatDate(bed.vacating.vacatingDate)}
                </p>
                <p className="mt-1 text-sm text-orange-50">
                  Notice fee {paiseToInr(bed.vacating.deductionPaise)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bed.vacating.status === 'pending' ? (
                    <RejectVacatingButton requestId={bed.vacating.requestId} pgId={pgId} />
                  ) : null}
                  {bed.vacating.status === 'approved' ? (
                    bed.vacating.settlementId ? (
                      <Link
                        href={`/admin/checkout-settlements/${bed.vacating.settlementId}`}
                        className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Open checkout settlement →
                      </Link>
                    ) : (
                      <>
                        <p className="text-[10px] text-orange-200/90">
                          Complete move-out via Checkout Processing — legacy Complete is disabled.
                        </p>
                        <Link
                          href="/admin/checkout-settlements"
                          className="inline-flex rounded-lg border border-orange-400/40 px-3 py-1.5 text-xs font-medium text-orange-100 hover:bg-orange-500/10"
                        >
                          Go to checkout settlements
                        </Link>
                      </>
                    )
                  ) : null}
                  {bed.vacating.status === 'approved' && !bed.vacating.settlementId ? (
                    <UndoVacatingApprovalButton requestId={bed.vacating.requestId} pgId={pgId} />
                  ) : null}
                  {bed.vacating.status === 'pending' || bed.vacating.status === 'approved' ? (
                    <CancelVacatingNoticeButton requestId={bed.vacating.requestId} pgId={pgId} />
                  ) : null}
                </div>
              </div>
            ) : null}

            <BedMapMoveForm
              pgId={pgId}
              bookingId={person.bookingId}
              customerId={person.customerId}
              currentBedId={bed.bedId}
              beds={moveBedOptions}
            />
            <BedMapReservationForm pgId={pgId} bookingId={person.bookingId} mode="shift_to_reservation" />
            <BedMapRemoveTenantButton
              pgId={pgId}
              bookingId={person.bookingId}
              customerName={person.customerName}
              bedLabel={`${floor.floorLabel} · Room ${room.roomNumber} · ${bed.bedCode}`}
              isOccupiedToday={Boolean(bed.occupant)}
            />
          </>
        ) : null}

        {person && bed.reserved && !bed.occupant ? (
          <BedMapReservationForm
            pgId={pgId}
            bookingId={person.bookingId}
            mode="activate_now"
            reservedFrom={bed.reservedFrom}
          />
        ) : null}

        {!person && bed.bedStatus === 'available' ? (
          <>
            <BedMapManualReservedToggle
              pgId={pgId}
              bedId={bed.bedId}
              bedCode={bed.bedCode}
              manualReservedCheckIn={bed.manualReservedCheckIn}
              disabled={bed.manualOccupied}
            />
            <BedMapManualOccupiedToggle
              pgId={pgId}
              bedId={bed.bedId}
              bedCode={bed.bedCode}
              manualOccupied={bed.manualOccupied}
              disabled={Boolean(bed.manualReservedCheckIn)}
            />
          </>
        ) : null}
      </div>
    </AdminAdvancedToolsSection>
  );
}
