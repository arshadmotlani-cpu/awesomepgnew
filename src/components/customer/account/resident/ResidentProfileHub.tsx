'use client';

import { ProfileOverviewPanel } from '@/src/components/customer/account/resident/ProfileOverviewPanel';
import { ProfileWalletPanel } from '@/src/components/customer/account/resident/ProfileWalletPanel';
import { ProfileEditSection } from '@/src/components/customer/account/resident/ProfileEditSection';
import { ResidentSubNav } from '@/src/components/customer/account/resident/ResidentSubpageLayout';
import { residentProfileHref } from '@/src/lib/accountNavigation';
import type { ResidentProfileSub } from '@/src/lib/accountNavigation';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { DepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import type { DepositLedgerEntry } from '@/src/db/schema/depositLedger';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';

type ReferralSummary = {
  lockedPaise: number;
  availablePaise: number;
  withdrawnPaise: number;
};

type Props = {
  sub: ResidentProfileSub;
  booking: ResidentBookingRow;
  billingCycleLabel: string;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  depositBalancePaise: number;
  depositDuePaise: number;
  moveOutStatus: string;
  roommatesCount: number;
  roomCapacity: number;
  ps4Active: boolean;
  fullName: string;
  email: string;
  phoneLocal: string;
  phoneDisplay: string;
  editExpanded?: boolean;
  bookingId: string;
  customerId: string;
  availableRefundPaise: number;
  entries: DepositLedgerEntry[];
  hasOpenVacating: boolean;
  refundEligibility: DepositRefundEligibility;
  settlementPreview: DepositRefundSettlementPreview | null;
  referralSummary?: ReferralSummary;
};

export function ResidentProfileHub({
  sub,
  booking,
  billingCycleLabel,
  depositRequiredPaise,
  depositPaidPaise,
  depositBalancePaise,
  depositDuePaise,
  moveOutStatus,
  roommatesCount,
  roomCapacity,
  ps4Active,
  fullName,
  email,
  phoneLocal,
  phoneDisplay,
  editExpanded = false,
  bookingId,
  customerId,
  availableRefundPaise,
  entries,
  hasOpenVacating,
  refundEligibility,
  settlementPreview,
  referralSummary,
}: Props) {
  const subNav = [
    { id: 'overview', label: 'Overview', href: residentProfileHref('overview') },
    { id: 'wallet', label: 'Wallet', href: residentProfileHref('wallet') },
  ];

  return (
    <div>
      <ResidentSubNav items={subNav} activeId={sub} />

      {sub === 'overview' ? (
        <>
          <ProfileOverviewPanel
            booking={booking}
            billingCycleLabel={billingCycleLabel}
            depositRequiredPaise={depositRequiredPaise}
            depositPaidPaise={depositPaidPaise}
            depositBalancePaise={depositBalancePaise}
            moveOutStatus={moveOutStatus}
            roommatesCount={roommatesCount}
            roomCapacity={roomCapacity}
            ps4Active={ps4Active}
          />
          <div className="mt-4">
            <ProfileEditSection
              fullName={fullName}
              email={email}
              phoneLocal={phoneLocal}
              phoneDisplay={phoneDisplay}
              defaultExpanded={editExpanded}
            />
          </div>
        </>
      ) : (
        <ProfileWalletPanel
          bookingId={bookingId}
          customerId={customerId}
          depositBalancePaise={depositBalancePaise}
          depositPaidPaise={depositPaidPaise}
          depositDuePaise={depositDuePaise}
          depositRequiredPaise={depositRequiredPaise}
          availableRefundPaise={availableRefundPaise}
          entries={entries}
          hasOpenVacating={hasOpenVacating}
          refundEligibility={refundEligibility}
          settlementPreview={settlementPreview}
          referralSummary={referralSummary}
        />
      )}
    </div>
  );
}
