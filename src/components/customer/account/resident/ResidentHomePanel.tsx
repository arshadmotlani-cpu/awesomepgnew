import Link from 'next/link';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { MyServicesPanel } from '@/src/components/customer/MyServicesPanel';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import type { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { ResidentHomeActiveRequests } from '@/src/components/customer/account/resident/ResidentHomeActiveRequests';
import { ResidentHomeAdminWaiting } from '@/src/components/customer/account/resident/ResidentHomeAdminWaiting';
import { ResidentHomeMoveOutStatus } from '@/src/components/customer/account/resident/ResidentHomeMoveOutStatus';
import { ResidentHomeNextPayment } from '@/src/components/customer/account/resident/ResidentHomeNextPayment';
import { ResidentHomePrimaryAction } from '@/src/components/customer/account/resident/ResidentHomePrimaryAction';
import { ResidentHomeStatusCard } from '@/src/components/customer/account/resident/ResidentHomeStatusCard';
import { ResidentHomeWhatNext } from '@/src/components/customer/account/resident/ResidentHomeWhatNext';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { ResidentElectricityDueBanner } from '@/src/components/customer/account/resident/ResidentElectricityDueBanner';
import { ResidentOutstandingBillsCard } from '@/src/components/customer/account/resident/ResidentOutstandingBillsCard';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';
import {
  deriveResidentHomePrimaryAction,
  deriveResidentHomeStatus,
  deriveWhatHappensNext,
} from '@/src/lib/residents/residentHomeState';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { PlaystationMembership } from '@/src/db/schema/playstationMemberships';
import type { ComponentProps } from 'react';

type BriefingProps = Omit<ComponentProps<typeof RoachieResidentBriefing>, 'sessionKey'>;

type OpenRequest = { id: string; bookingId: string; type: string; status: string };

export function ResidentHomePanel({
  booking,
  financialSummary,
  kycStatus,
  documentsSubmitted,
  openRequests,
  depositDuePaise,
  depositRequiredPaise,
  depositPaidPaise,
  depositPaymentLinkUrl,
  upcomingPayments,
  dueBillRows = [],
  firstUnpaidRentId,
  firstUnpaidElectricityId,
  hasOpenVacating,
  vacatingStatus,
  checkoutStatus,
  vacatingDate,
  residentBriefing,
  ps4Membership,
  tenantActive,
}: {
  booking: ResidentBookingRow;
  financialSummary: ResidentFinancialSummary;
  kycStatus: string;
  documentsSubmitted: boolean;
  openRequests: OpenRequest[];
  depositDuePaise: number;
  depositRequiredPaise?: number;
  depositPaidPaise?: number;
  depositPaymentLinkUrl: string | null;
  upcomingPayments: UpcomingPaymentRow[];
  dueBillRows?: PaymentDueRow[];
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  hasOpenVacating: boolean;
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate: string | null;
  settlementLines: Array<{ label: string; amountPaise: number; tone?: 'deduction' | 'credit' | 'neutral' }>;
  residentBriefing: BriefingProps | null;
  ps4Membership: PlaystationMembership | null;
  tenantActive: boolean;
}) {
  const bookingRequests = openRequests.filter((r) => r.bookingId === booking.bookingId);
  const firstPayment = upcomingPayments[0] ?? null;
  const electricityDueRow =
    dueBillRows.find((r) => r.key.startsWith('elec-') && r.href) ?? null;

  const status = deriveResidentHomeStatus({
    kycStatus,
    documentsSubmitted,
    hasMoveOutInProgress: hasOpenVacating,
    vacatingStatus,
    checkoutStatus,
    totalDuePaise: financialSummary.totals.outstandingPaise,
    openRequestCount: bookingRequests.length,
    pgName: booking.pgName,
    roomNumber: booking.roomNumber,
    bedCode: booking.bedCode,
    nextBillStatus: firstPayment?.status ?? null,
  });

  const primaryAction = deriveResidentHomePrimaryAction({
    kycStatus,
    documentsSubmitted,
    totalDuePaise: financialSummary.totals.outstandingPaise,
    depositDuePaise,
    depositPaymentLinkUrl,
    firstUnpaidRentId,
    firstUnpaidElectricityId,
    firstPayment,
    hasMoveOutInProgress: hasOpenVacating,
    openRequestCount: bookingRequests.length,
  });

  const whatNext = deriveWhatHappensNext({
    phase: status.phase,
    documentsSubmitted,
    firstPayment,
    openRequestCount: bookingRequests.length,
  });

  const hasOutstandingBills = dueBillRows.length > 0 || depositDuePaise > 0;

  return (
    <div className="space-y-4 pb-2">
      {electricityDueRow ? <ResidentElectricityDueBanner row={electricityDueRow} /> : null}

      {hasOutstandingBills ? (
        <ResidentOutstandingBillsCard
          dueRows={dueBillRows}
          depositDuePaise={depositDuePaise}
          depositRequiredPaise={depositRequiredPaise}
          depositPaidPaise={depositPaidPaise}
          depositPaymentLinkUrl={depositPaymentLinkUrl}
        />
      ) : (
        <ResidentHomePrimaryAction action={primaryAction} />
      )}

      <ResidentHomeStatusCard
        status={status}
        bookingCode={booking.bookingCode}
        checkInDate={booking.checkInDate}
        expectedCheckoutDate={booking.expectedCheckoutDate}
      />

      <ResidentHomeAdminWaiting
        kycStatus={kycStatus}
        documentsSubmitted={documentsSubmitted}
        vacatingStatus={vacatingStatus}
        checkoutStatus={checkoutStatus}
        openRequests={bookingRequests}
      />

      <ResidentHomeWhatNext message={whatNext} />

      {!hasOutstandingBills ? <ResidentHomeNextPayment payment={firstPayment} /> : null}

      {(hasOpenVacating || vacatingStatus || checkoutStatus) && (
        <ResidentHomeMoveOutStatus
          vacatingStatus={vacatingStatus}
          checkoutStatus={checkoutStatus}
          vacatingDate={vacatingDate}
        />
      )}

      <ResidentHomeActiveRequests requests={bookingRequests} />

      <ResidentMoreSection title="More" description="Help, add-ons, and extra details.">
        {residentBriefing ? (
          <RoachieResidentBriefing sessionKey="resident-dashboard-briefing-v1" {...residentBriefing} />
        ) : null}
        <DepositRefundNotice />
        <MyServicesPanel membership={ps4Membership} isActiveTenant={tenantActive} />
        <p className="text-xs text-zinc-600">
          Use the navigation bar for{' '}
          <Link href={residentTabHref('payments')} className="font-semibold text-indigo-700">
            Payments
          </Link>
          ,{' '}
          <Link href={residentTabHref('wallet')} className="font-semibold text-indigo-700">
            Wallet
          </Link>
          , and{' '}
          <Link href={residentTabHref('vacating')} className="font-semibold text-indigo-700">
            Move-out
          </Link>
          .
        </p>
      </ResidentMoreSection>
    </div>
  );
}
