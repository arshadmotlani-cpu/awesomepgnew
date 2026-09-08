'use client';

import { ProfileOverviewPanel } from '@/src/components/customer/account/resident/ProfileOverviewPanel';
import { ProfileWalletPanel } from '@/src/components/customer/account/resident/ProfileWalletPanel';
import {
  ResidentPaymentsV2Hub,
  type BillDueRow,
  type LifetimeTotals,
  type PaidHistoryRow,
} from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';
import { ResidentSubNav } from '@/src/components/customer/account/resident/ResidentSubpageLayout';
import { residentStayHref, residentTabHref } from '@/src/lib/accountNavigation';
import type { ResidentStaySub } from '@/src/lib/accountNavigation';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { DepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import type { DepositLedgerEntry } from '@/src/db/schema/depositLedger';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import type { ResidentElectricityBillingState } from '@/src/lib/residents/residentElectricityBillingState';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import type { ResidentElectricityHistoryItem } from '@/src/components/customer/account/resident/ResidentElectricityHistory';

type ReferralSummary = {
  lockedPaise: number;
  availablePaise: number;
  withdrawnPaise: number;
};

type StayOverviewProps = {
  booking: ResidentBookingRow;
  billingCycleLabel: string;
  monthlyRentPaise: number;
  moveOutStatus: string;
  roommatesCount: number;
  roomCapacity: number;
  ps4Active: boolean;
  canRequestVacatingDateChange?: boolean;
};

type StayWalletProps = {
  bookingId: string;
  customerId: string;
  depositBalancePaise: number;
  depositDuePaise: number;
  availableRefundPaise: number;
  unusedPrepaidRentPaise?: number;
  depositRefundablePaise?: number;
  entries: DepositLedgerEntry[];
  hasOpenVacating: boolean;
  refundEligibility: DepositRefundEligibility;
  settlementPreview: DepositRefundSettlementPreview | null;
  referralSummary?: ReferralSummary;
};

type StayPaymentsProps = {
  dueRows: BillDueRow[];
  pendingApprovalRows: PaymentDueRow[];
  rejectedBillRows?: PaymentDueRow[];
  paidBills: PaidHistoryRow[];
  cancelledBills?: PaidHistoryRow[];
  pendingRentNotice?: string | null;
  electricityBillingPending?: ResidentElectricityBillingState | null;
  electricityHistory?: ResidentElectricityHistoryItem[];
  historyHref: string | null;
  lifetimeTotals: LifetimeTotals;
  payableNowTotalPaise: number;
  payAll: {
    visible: boolean;
    href: string | null;
    totalPaise: number;
  };
};

type Props = {
  sub: ResidentStaySub;
  overview: StayOverviewProps;
  wallet: StayWalletProps;
  payments: StayPaymentsProps;
};

export function ResidentStayHub({ sub, overview, wallet, payments }: Props) {
  const subNav = [
    { id: 'payments', label: 'Payments', href: residentStayHref('payments') },
    { id: 'overview', label: 'Overview', href: residentStayHref('overview') },
    { id: 'wallet', label: 'Wallet', href: residentStayHref('wallet') },
    { id: 'due', label: 'Due Rent / Bill Due', href: residentStayHref('due') },
  ];

  const changeFinalStayHref = overview.canRequestVacatingDateChange
    ? `${residentTabHref('requests', { category: 'move_out' })}#resident-move-out`
    : null;

  return (
    <div className="apg-resident-panel-content">
      <ResidentSubNav items={subNav} activeId={sub} />

      {sub === 'overview' ? (
        <ProfileOverviewPanel
          booking={overview.booking}
          billingCycleLabel={overview.billingCycleLabel}
          monthlyRentPaise={overview.monthlyRentPaise}
          moveOutStatus={overview.moveOutStatus}
          roommatesCount={overview.roommatesCount}
          roomCapacity={overview.roomCapacity}
          ps4Active={overview.ps4Active}
          changeFinalStayHref={changeFinalStayHref}
        />
      ) : null}

      {sub === 'wallet' ? (
        <ProfileWalletPanel
          bookingId={wallet.bookingId}
          customerId={wallet.customerId}
          depositBalancePaise={wallet.depositBalancePaise}
          depositDuePaise={wallet.depositDuePaise}
          availableRefundPaise={wallet.availableRefundPaise}
          unusedPrepaidRentPaise={wallet.unusedPrepaidRentPaise}
          depositRefundablePaise={wallet.depositRefundablePaise}
          entries={wallet.entries}
          hasOpenVacating={wallet.hasOpenVacating}
          refundEligibility={wallet.refundEligibility}
          settlementPreview={wallet.settlementPreview}
          referralSummary={wallet.referralSummary}
        />
      ) : null}

      {sub === 'payments' || sub === 'due' ? (
        <ResidentPaymentsV2Hub
          dueRows={payments.dueRows}
          pendingApprovalRows={payments.pendingApprovalRows}
          rejectedBillRows={payments.rejectedBillRows}
          pendingRentNotice={payments.pendingRentNotice}
          electricityBillingPending={payments.electricityBillingPending}
          payableNowTotalPaise={payments.payableNowTotalPaise}
          payAll={payments.payAll}
        />
      ) : null}
    </div>
  );
}
