import Link from 'next/link';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { MyServicesPanel } from '@/src/components/customer/MyServicesPanel';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import type { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { ResidentHomeActiveRequests } from '@/src/components/customer/account/resident/ResidentHomeActiveRequests';
import { ResidentHomeNextPayment } from '@/src/components/customer/account/resident/ResidentHomeNextPayment';
import { ResidentHomePrimaryAction } from '@/src/components/customer/account/resident/ResidentHomePrimaryAction';
import { ResidentHomeStatusCard } from '@/src/components/customer/account/resident/ResidentHomeStatusCard';
import { ResidentHomeWhatNext } from '@/src/components/customer/account/resident/ResidentHomeWhatNext';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import {
  deriveResidentHomePrimaryAction,
  deriveResidentHomeStatus,
  deriveWhatHappensNext,
} from '@/src/lib/residents/residentHomeState';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';
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
  depositPaymentLinkUrl,
  upcomingPayments,
  firstUnpaidRentId,
  firstUnpaidElectricityId,
  hasOpenVacating,
  vacatingStatus,
  checkoutStatus,
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
  depositPaymentLinkUrl: string | null;
  upcomingPayments: UpcomingPaymentRow[];
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  hasOpenVacating: boolean;
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  settlementLines: Array<{ label: string; amountPaise: number; tone?: 'deduction' | 'credit' | 'neutral' }>;
  residentBriefing: BriefingProps | null;
  ps4Membership: PlaystationMembership | null;
  tenantActive: boolean;
}) {
  const bookingRequests = openRequests.filter((r) => r.bookingId === booking.bookingId);
  const firstPayment = upcomingPayments[0] ?? null;

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

  return (
    <div className="space-y-4 pb-2">
      <ResidentHomeStatusCard
        status={status}
        bookingCode={booking.bookingCode}
        checkInDate={booking.checkInDate}
        expectedCheckoutDate={booking.expectedCheckoutDate}
      />

      <ResidentHomePrimaryAction action={primaryAction} />

      <ResidentHomeWhatNext message={whatNext} />

      <ResidentHomeNextPayment payment={firstPayment} />

      <ResidentHomeActiveRequests requests={bookingRequests} />

      <ResidentMoreSection title="More" description="Help, add-ons, and extra details.">
        {residentBriefing ? (
          <RoachieResidentBriefing sessionKey="resident-dashboard-briefing-v1" {...residentBriefing} />
        ) : null}
        <DepositRefundNotice />
        <MyServicesPanel membership={ps4Membership} isActiveTenant={tenantActive} />
        <p className="text-xs text-zinc-600">
          Bills, wallet, and move-out tools are in the tabs below —{' '}
          <Link href={residentTabHref('payments')} className="font-semibold text-indigo-700">
            Payments
          </Link>
          ,{' '}
          <Link href={residentTabHref('wallet')} className="font-semibold text-indigo-700">
            Wallet
          </Link>
          ,{' '}
          <Link href={residentTabHref('vacating')} className="font-semibold text-indigo-700">
            Move-out
          </Link>
          .
        </p>
      </ResidentMoreSection>
    </div>
  );
}
