'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { residentProfileRoomSharingLabel } from '@/src/lib/roomCapacitySsot';
import { residentPaymentsHref } from '@/src/lib/accountNavigation';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { ResidentBookingRow } from '@/src/db/queries/customer';

type Props = {
  booking: ResidentBookingRow;
  billingCycleLabel: string;
  monthlyRentPaise: number;
  moveOutStatus: string;
  roommatesCount: number;
  roomCapacity: number;
  ps4Active?: boolean;
  changeFinalStayHref?: string | null;
};

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/8 py-3 last:border-0">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd className="text-right text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

export function ProfileOverviewPanel({
  booking,
  billingCycleLabel,
  monthlyRentPaise,
  moveOutStatus,
  roommatesCount,
  roomCapacity,
  ps4Active = false,
  changeFinalStayHref = null,
}: Props) {
  // roommatesCount is derived as capacity-1 upstream; label uses capacity SSOT only.
  void roommatesCount;
  const sharingLabel = residentProfileRoomSharingLabel(roomCapacity);

  return (
    <div className="space-y-4 pb-2 max-md:space-y-5">
      <ApgCard tier="resident" className="space-y-1">
        <h2 className="text-base font-semibold text-white">Current stay</h2>
        <p className="text-sm text-apg-silver">
          {booking.pgName} · Room {booking.roomNumber} · Bed {booking.bedCode}
        </p>
        <dl className="mt-3">
          <StatRow label="Check-in" value={formatDate(booking.checkInDate)} />
          <StatRow label="Billing cycle" value={billingCycleLabel} />
          <StatRow label="Monthly rent" value={paiseToInr(monthlyRentPaise)} />
          <StatRow label="Move-out status" value={moveOutStatus} />
          {changeFinalStayHref ? (
            <div className="py-3">
              <Link
                href={changeFinalStayHref}
                className="text-sm font-semibold text-apg-orange hover:underline"
              >
                Change final stay date →
              </Link>
            </div>
          ) : null}
          <StatRow label="Room sharing" value={sharingLabel} />
        </dl>
      </ApgCard>

      {ps4Active ? (
        <ApgCard tier="resident">
          <p className="text-sm text-apg-silver">
            <span className="font-semibold text-white">PS4 membership</span> — active. Manage via
            Requests → Support if you need help.
          </p>
        </ApgCard>
      ) : null}

      <ApgCard tier="resident">
        <p className="text-sm text-apg-silver">
          Bills and payment history live in{' '}
          <Link href={residentPaymentsHref('due')} className="font-semibold text-apg-orange hover:underline">
            Payments
          </Link>
          .
        </p>
      </ApgCard>
    </div>
  );
}
