import { ReferralsPanel } from '@/src/components/customer/account/ReferralsPanel';
import { ResidentConciergeChat } from '@/src/components/customer/account/ResidentConciergeChat';
import { ResidentProfileHub } from '@/src/components/customer/account/resident/ResidentProfileHub';
import { ResidentPaymentsV2Hub } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { RequestsHome } from '@/src/components/customer/account/resident/requests/RequestsHome';
import type { ResidentPaymentsSub, ResidentProfileSub } from '@/src/lib/accountNavigation';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  parseDevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { billingCycleLabel } from '@/src/lib/residents/residentPortalPresentation';
import { indianLocalFromE164, formatIndianPhoneDisplay } from '@/src/lib/phone';
import type { ResidentAccountContext } from '@/src/services/residentAccountContext';
import {
  loadResidentConciergeTabData,
  loadResidentPaymentsTabData,
  loadResidentProfileTabData,
  loadResidentReferralsTabData,
  loadResidentRequestsTabData,
} from '@/src/services/residentPortalTabData';
import { getCustomerSession } from '@/src/lib/auth/session';
import { cookies } from 'next/headers';
import type { RequestCategoryId } from '@/src/lib/residents/requestCenter';

type PortalSession = NonNullable<Awaited<ReturnType<typeof getCustomerSession>>>;

async function portalSession(customerId: string): Promise<PortalSession | null> {
  const session = await getCustomerSession();
  if (!session || session.customerId !== customerId) return null;
  return session;
}

export async function ResidentProfileTabSection({
  preloaded,
  customerId,
  profileSub,
  editExpanded,
  developerTestMode,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  profileSub: ResidentProfileSub;
  editExpanded: boolean;
  developerTestMode: boolean;
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  const cookieStore = await cookies();
  const simulatedDurationMode = developerTestMode
    ? parseDevResidentDurationMode(cookieStore.get(DEV_RESIDENT_DURATION_COOKIE)?.value)
    : null;

  const data = await loadResidentProfileTabData({
    preloaded,
    session,
    developerTestMode,
    simulatedDurationMode,
  });

  if (!data.primaryBooking) return null;

  return (
    <ResidentProfileHub
      sub={profileSub}
      booking={data.primaryBooking.booking}
      billingCycleLabel={
        data.monthlyRentDisplay?.billingCycleLabel ??
        billingCycleLabel(data.primaryBooking.booking.checkInDate)
      }
      monthlyRentPaise={data.monthlyRentPaise}
      depositRequiredPaise={
        data.primaryDepositCard?.depositPaise ?? data.primaryBooking.booking.depositPaise
      }
      depositPaidPaise={
        data.primaryDepositCard?.collectedPaise ?? data.primaryBooking.deposit?.collectedPaise ?? 0
      }
      depositBalancePaise={data.walletDepositHeldPaise}
      depositDuePaise={data.primaryDepositCard?.depositDuePaise ?? 0}
      moveOutStatus={data.moveOutStatus}
      roommatesCount={Math.max(0, 4 - 1)}
      roomCapacity={4}
      ps4Active={Boolean(data.ps4Membership)}
      fullName={data.customer.fullName}
      email={data.customer.email}
      phoneLocal={indianLocalFromE164(data.customer.phone) ?? ''}
      phoneDisplay={formatIndianPhoneDisplay(session.phone)}
      editExpanded={editExpanded}
      bookingId={data.primaryBooking.bookingId}
      customerId={session.customerId}
      availableRefundPaise={data.walletAvailableRefundPaise}
      entries={data.depositEntries}
      hasOpenVacating={data.hasOpenVacating}
      refundEligibility={data.refundEligibility}
      settlementPreview={data.refundSettlementPreview}
      referralSummary={{
        lockedPaise: data.referralSummary.lockedPaise,
        availablePaise: data.referralSummary.availablePaise,
        withdrawnPaise: data.referralSummary.withdrawnPaise,
      }}
      vacatingStatus={data.primaryVacating?.status ?? null}
      checkoutStatus={data.checkoutByBooking.get(data.primaryBooking.bookingId) ?? null}
      vacatingDate={data.primaryVacating?.vacatingDate ?? null}
      settlementWaterfall={data.primaryCheckoutSettlement?.waterfall ?? null}
    />
  );
}

export async function ResidentPaymentsTabSection({
  preloaded,
  customerId,
  paymentsSub,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  paymentsSub: ResidentPaymentsSub;
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  const data = await loadResidentPaymentsTabData({ preloaded, session });
  if (!data.primaryBooking) return null;

  return (
    <ResidentPaymentsV2Hub
      sub={paymentsSub}
      dueRows={data.enrichedDueRows}
      pendingApprovalRows={data.pendingApprovalRows}
      rejectedBillRows={data.rejectedBillRows}
      paidBills={data.paidHistory}
      cancelledBills={data.cancelledBillRows}
      pendingRentNotice={data.pendingRentNotice?.message ?? null}
      electricityBillingPending={data.electricityBillingPending}
      electricityHistory={data.electricityHistory}
      historyHref={data.historyHref}
      lifetimeTotals={data.lifetimeTotals}
    />
  );
}

export async function ResidentRequestsTabSection({
  preloaded,
  customerId,
  developerTestMode,
  requestsQuery,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  developerTestMode: boolean;
  requestsQuery: {
    requestId?: string;
    make?: boolean;
    category?: RequestCategoryId;
  };
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  const cookieStore = await cookies();
  const simulatedDurationMode = developerTestMode
    ? parseDevResidentDurationMode(cookieStore.get(DEV_RESIDENT_DURATION_COOKIE)?.value)
    : null;

  const data = await loadResidentRequestsTabData({
    preloaded,
    session,
    developerTestMode,
    simulatedDurationMode,
  });
  if (!data) return null;

  return (
    <ResidentSectionErrorBoundary
      page="requests_home"
      bookingId={data.primaryBooking.bookingId}
      customerId={session.customerId}
      title="Requests could not load"
    >
      <RequestsHome
        customerId={session.customerId}
        bookingId={data.primaryBooking.bookingId}
        bookingCode={data.primaryBooking.bookingCode}
        pgId={data.primaryBooking.booking.pgId}
        fromBedId={data.fromBedId}
        roomLabel={data.roomLabel}
        refundableBalancePaise={data.walletAvailableRefundPaise}
        hasDepositDue={data.hasDepositDue}
        activeRequests={data.activeRequests}
        selectedRequestId={requestsQuery.requestId ?? null}
        startMake={requestsQuery.make ?? false}
        initialCategory={requestsQuery.category ?? null}
        vacating={data.primaryVacating}
        bookingStatus={data.primaryBooking.booking.status}
        durationMode={data.effectiveDurationMode ?? data.primaryBooking.booking.durationMode}
        expectedCheckoutDate={data.primaryBooking.booking.expectedCheckoutDate}
        bookingCreatedAt={
          data.primaryBooking.booking.createdAt instanceof Date
            ? data.primaryBooking.booking.createdAt.toISOString()
            : String(data.primaryBooking.booking.createdAt)
        }
        checkoutSettlementStatus={data.checkoutByBooking.get(data.primaryBooking.bookingId) ?? null}
        checkoutSettlement={data.checkoutSettlementByBooking.get(data.primaryBooking.bookingId) ?? null}
        checkoutSettlementSuppressed={data.primaryVacating?.checkoutSettlementSuppressed === true}
        monthlyRentPaise={data.monthlyRentPaise}
        depositHeldPaise={data.walletDepositHeldPaise}
        moveInDate={data.primaryBooking.booking.checkInDate}
        developerTestEmail={developerTestMode ? session.email : null}
        estimatedSettlement={data.primaryEstimatedSettlement}
        pendingDateChangeRequestId={data.primaryPendingDateChangeRequestId}
        settlementContext={data.primarySettlementContext}
        settlementDocument={data.primarySettlementDocument}
        settlementNoticeDisplay={data.primaryNoticeDisplay}
      />
    </ResidentSectionErrorBoundary>
  );
}

export async function ResidentReferralsTabSection({
  preloaded,
  customerId,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  const referralSummary = await loadResidentReferralsTabData(customerId);
  return (
    <ReferralsPanel
      customerId={session.customerId}
      customerName={session.fullName || preloaded.customer.fullName || 'Resident'}
      referralSummary={referralSummary}
    />
  );
}

export async function ResidentConciergeTabSection({
  preloaded,
  customerId,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  const conciergeContext = await loadResidentConciergeTabData({ preloaded, session });
  if (!conciergeContext) return null;
  return <ResidentConciergeChat context={conciergeContext} />;
}
