import Link from 'next/link';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { MyServicesPanel } from '@/src/components/customer/MyServicesPanel';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import type { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { ResidentHomePrimaryActions, buildHomePrimaryActions } from '@/src/components/customer/account/resident/ResidentHomePrimaryActions';
import { ResidentHomeSummary } from '@/src/components/customer/account/resident/ResidentHomeSummary';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import {
  ResidentUpcomingPayments,
  type UpcomingPaymentRow,
} from '@/src/components/customer/account/resident/ResidentUpcomingPayments';
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
  residentBriefing: BriefingProps | null;
  ps4Membership: PlaystationMembership | null;
  tenantActive: boolean;
}) {
  const bookingRequests = openRequests.filter((r) => r.bookingId === booking.bookingId);
  const primaryActions = buildHomePrimaryActions({
    kycStatus,
    documentsSubmitted,
    totalDuePaise: financialSummary.totals.outstandingPaise,
    depositDuePaise,
    depositPaymentLinkUrl,
    firstUnpaidRentId,
    firstUnpaidElectricityId,
    openRequestCount: bookingRequests.length,
    hasOpenVacating,
  });

  return (
    <div className="space-y-6">
      <ResidentHomeSummary
        pgName={booking.pgName}
        roomNumber={booking.roomNumber}
        bedCode={booking.bedCode}
        bookingCode={booking.bookingCode}
        checkInDate={booking.checkInDate}
        expectedCheckoutDate={booking.expectedCheckoutDate}
        monthlyRentPaise={booking.monthlyRentPaise}
        financialSummary={financialSummary}
        kycStatus={kycStatus}
        documentsSubmitted={documentsSubmitted}
        openRequestCount={bookingRequests.length}
      />

      <ResidentHomePrimaryActions actions={primaryActions} />

      <ResidentUpcomingPayments rows={upcomingPayments} />

      {bookingRequests.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Pending requests</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {bookingRequests.map((r) => (
              <li key={r.id}>
                {r.type === 'deposit_refund' ? 'Deposit refund' : r.type === 'vacating' ? 'Move-out' : 'Request'} —{' '}
                {r.status.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
          <Link href={residentTabHref('requests')} className="mt-2 inline-block text-xs font-semibold text-[#FF5A1F]">
            Open requests center →
          </Link>
        </section>
      ) : null}

      <ResidentMoreSection title="More on home" description="Help, add-ons, and policy notes.">
        {residentBriefing ? (
          <RoachieResidentBriefing sessionKey="resident-dashboard-briefing-v1" {...residentBriefing} />
        ) : null}
        <DepositRefundNotice />
        <MyServicesPanel membership={ps4Membership} isActiveTenant={tenantActive} />
        <p className="text-xs text-zinc-600">
          Full bill tables and move-out tools live under{' '}
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
