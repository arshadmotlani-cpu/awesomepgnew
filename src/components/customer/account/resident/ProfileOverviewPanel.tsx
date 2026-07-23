'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { ResidentHomeMoveOutStatus } from '@/src/components/customer/account/resident/ResidentHomeMoveOutStatus';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { residentPaymentsHref } from '@/src/lib/accountNavigation';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { ResidentBookingRow } from '@/src/db/queries/customer';

type Props = {
  booking: ResidentBookingRow;
  billingCycleLabel: string;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  depositBalancePaise: number;
  moveOutStatus: string;
  roommatesCount: number;
  roomCapacity: number;
  ps4Active?: boolean;
  vacatingStatus?: string | null;
  checkoutStatus?: string | null;
  vacatingDate?: string | null;
  settlementWaterfall?: CheckoutSettlementWaterfall | null;
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
  depositRequiredPaise,
  depositPaidPaise,
  depositBalancePaise,
  moveOutStatus,
  roommatesCount,
  roomCapacity,
  ps4Active = false,
  vacatingStatus = null,
  checkoutStatus = null,
  vacatingDate = null,
  settlementWaterfall = null,
}: Props) {
  const sharingLabel =
    roomCapacity <= 1 ? 'Private room' : `${roomCapacity}-sharing (${roommatesCount} roommate${roommatesCount === 1 ? '' : 's'})`;

  const showMoveOutCard = Boolean(vacatingStatus || checkoutStatus);

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
          <StatRow label="Monthly rent" value={paiseToInr(booking.monthlyRentPaise)} />
          <StatRow label="Deposit required" value={paiseToInr(depositRequiredPaise)} />
          <StatRow label="Deposit paid" value={paiseToInr(depositPaidPaise)} />
          <StatRow label="Deposit balance" value={paiseToInr(depositBalancePaise)} />
          <StatRow label="Move-out status" value={moveOutStatus} />
          <StatRow label="Room sharing" value={sharingLabel} />
        </dl>
      </ApgCard>

      {showMoveOutCard ? (
        <ResidentHomeMoveOutStatus
          vacatingStatus={vacatingStatus}
          checkoutStatus={checkoutStatus}
          vacatingDate={vacatingDate}
          settlementWaterfall={settlementWaterfall}
        />
      ) : null}

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
