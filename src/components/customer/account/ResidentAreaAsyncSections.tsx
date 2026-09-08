import { ReferralsPanel } from '@/src/components/customer/account/ReferralsPanel';
import { ResidentConciergeChat } from '@/src/components/customer/account/ResidentConciergeChat';
import { ProfileEditSection } from '@/src/components/customer/account/resident/ProfileEditSection';
import { ResidentStayHub } from '@/src/components/customer/account/resident/ResidentStayHub';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { ResidentPortalSectionFallback } from '@/src/components/customer/account/resident/ResidentPortalSectionFallback';
import { logPortalLoaderFailure } from '@/src/lib/residents/residentPortalLoaderSafety';
import { RequestsHome } from '@/src/components/customer/account/resident/requests/RequestsHome';
import type { ResidentPaymentsSub, ResidentStaySub } from '@/src/lib/accountNavigation';
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

export async function ResidentAccountProfileSection({
  preloaded,
  customerId,
  editExpanded,
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  editExpanded: boolean;
}) {
  const session = await portalSession(customerId);
  if (!session) return null;

  let data: Awaited<ReturnType<typeof loadResidentProfileTabData>>;
  try {
    data = await loadResidentProfileTabData({
      preloaded,
      session,
      developerTestMode: false,
      simulatedDurationMode: null,
    });
  } catch (error) {
    logPortalLoaderFailure({
      section: 'profile_tab',
      customerId,
      bookingId: preloaded.primaryBooking?.bookingId ?? null,
      loader: 'ResidentAccountProfileSection',
      required: false,
      error,
    });
    return (
      <ResidentPortalSectionFallback
        section="profile"
        title="Profile could not load"
        message="Your account details are safe. Please try again."
      />
    );
  }

  return (
    <ProfileEditSection
      fullName={data.customer.fullName}
      email={data.customer.email}
      phoneLocal={indianLocalFromE164(data.customer.phone) ?? ''}
      phoneDisplay={formatIndianPhoneDisplay(session.phone)}
      defaultExpanded={editExpanded}
    />
  );
}

export async function ResidentStayTabSection({
  preloaded,
  customerId,
  staySub,
  paymentsSub,
  developerTestMode,
  requestsQuery = {},
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  staySub: ResidentStaySub;
  paymentsSub: ResidentPaymentsSub;
  developerTestMode: boolean;
  requestsQuery?: {
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

  let profileData: Awaited<ReturnType<typeof loadResidentProfileTabData>>;
  let paymentsData: Awaited<ReturnType<typeof loadResidentPaymentsTabData>>;
  try {
    [profileData, paymentsData] = await Promise.all([
      loadResidentProfileTabData({
        preloaded,
        session,
        developerTestMode,
        simulatedDurationMode,
      }),
      loadResidentPaymentsTabData({ preloaded, session }),
    ]);
  } catch (error) {
    logPortalLoaderFailure({
      section: 'stay_tab',
      customerId,
      bookingId: preloaded.primaryBooking?.bookingId ?? null,
      loader: 'ResidentStayTabSection',
      required: false,
      error,
    });
    return (
      <ResidentPortalSectionFallback
        section="stay"
        title="My Stay could not load"
        message="Your stay and payment records are safe. Please try again."
      />
    );
  }

  if (!profileData.primaryBooking) return null;

  let requestsPanel = null;
  if (staySub === 'requests') {
    try {
      const requestsData = await loadResidentRequestsTabData({
        preloaded,
        session,
        developerTestMode,
        simulatedDurationMode,
      });
      if (requestsData) {
        requestsPanel = (
          <ResidentSectionErrorBoundary
            page="requests_home"
            bookingId={requestsData.primaryBooking.bookingId}
            customerId={session.customerId}
            title="Requests could not load"
          >
            <RequestsHome
              customerId={session.customerId}
              bookingId={requestsData.primaryBooking.bookingId}
              bookingCode={requestsData.primaryBooking.bookingCode}
              pgId={requestsData.primaryBooking.booking.pgId}
              fromBedId={requestsData.fromBedId}
              roomLabel={requestsData.roomLabel}
              refundableBalancePaise={requestsData.walletAvailableRefundPaise}
              hasDepositDue={requestsData.hasDepositDue}
              activeRequests={requestsData.activeRequests}
              selectedRequestId={requestsQuery.requestId ?? null}
              startMake={requestsQuery.make ?? false}
              initialCategory={requestsQuery.category ?? null}
              vacating={requestsData.primaryVacating}
              bookingStatus={requestsData.primaryBooking.booking.status}
              durationMode={
                requestsData.effectiveDurationMode ?? requestsData.primaryBooking.booking.durationMode
              }
              expectedCheckoutDate={requestsData.primaryBooking.booking.expectedCheckoutDate}
              bookingCreatedAt={
                requestsData.primaryBooking.booking.createdAt instanceof Date
                  ? requestsData.primaryBooking.booking.createdAt.toISOString()
                  : String(requestsData.primaryBooking.booking.createdAt)
              }
              checkoutSettlementStatus={
                requestsData.checkoutByBooking.get(requestsData.primaryBooking.bookingId) ?? null
              }
              checkoutSettlement={
                requestsData.checkoutSettlementByBooking.get(requestsData.primaryBooking.bookingId) ??
                null
              }
              checkoutSettlementSuppressed={
                requestsData.primaryVacating?.checkoutSettlementSuppressed === true
              }
              monthlyRentPaise={requestsData.monthlyRentPaise}
              depositHeldPaise={requestsData.walletDepositHeldPaise}
              moveInDate={requestsData.primaryBooking.booking.checkInDate}
              developerTestEmail={developerTestMode ? session.email : null}
              estimatedSettlement={requestsData.primaryEstimatedSettlement}
              pendingDateChangeRequestId={requestsData.primaryPendingDateChangeRequestId}
              pendingDateChangePreview={requestsData.primaryPendingDateChangePreview}
              settlementContext={requestsData.primarySettlementContext}
              settlementDocument={requestsData.primarySettlementDocument}
              settlementNoticeDisplay={requestsData.primaryNoticeDisplay}
              exitBrainSnapshot={requestsData.primaryExitBrainSnapshot}
            />
          </ResidentSectionErrorBoundary>
        );
      }
    } catch (error) {
      logPortalLoaderFailure({
        section: 'requests_tab',
        customerId,
        bookingId: preloaded.primaryBooking?.bookingId ?? null,
        loader: 'ResidentStayTabSection_requests',
        required: false,
        error,
      });
      requestsPanel = (
        <ResidentPortalSectionFallback
          section="requests"
          title="Requests could not load"
          message="Your move-out and service requests are safe. Please try again to view request status."
        />
      );
    }
  }

  return (
    <>
      {paymentsData.optionalDegraded && staySub === 'payments' ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Some payment details are temporarily unavailable. Your rent and deposit balances remain
          accurate.
        </p>
      ) : null}
      <ResidentStayHub
        sub={staySub}
        paymentsSub={paymentsSub}
        overview={{
          booking: profileData.primaryBooking.booking,
          billingCycleLabel:
            profileData.monthlyRentDisplay?.billingCycleLabel ??
            billingCycleLabel(profileData.primaryBooking.booking.checkInDate),
          monthlyRentPaise: profileData.monthlyRentPaise,
          moveOutStatus: profileData.moveOutStatus,
          roommatesCount: profileData.roommatesCount,
          roomCapacity: profileData.roomCapacity,
          ps4Active: Boolean(profileData.ps4Membership),
          canRequestVacatingDateChange: profileData.canRequestVacatingDateChange,
        }}
        wallet={{
          bookingId: profileData.primaryBooking.bookingId,
          customerId: session.customerId,
          depositBalancePaise: profileData.walletDepositHeldPaise,
          depositDuePaise: profileData.primaryDepositCard?.depositDuePaise ?? 0,
          availableRefundPaise: profileData.walletAvailableRefundPaise,
          unusedPrepaidRentPaise: profileData.walletUnusedPrepaidRentPaise,
          depositRefundablePaise: profileData.walletDepositRefundablePaise,
          entries: profileData.depositEntries,
          hasOpenVacating: profileData.hasOpenVacating,
          refundEligibility: profileData.refundEligibility,
          settlementPreview: profileData.refundSettlementPreview,
          referralSummary: {
            lockedPaise: profileData.referralSummary.lockedPaise,
            availablePaise: profileData.referralSummary.availablePaise,
            withdrawnPaise: profileData.referralSummary.withdrawnPaise,
          },
        }}
        payments={{
          dueRows: paymentsData.enrichedDueRows,
          pendingApprovalRows: paymentsData.pendingApprovalRows,
          rejectedBillRows: paymentsData.rejectedBillRows,
          paidBills: paymentsData.paidHistory,
          cancelledBills: paymentsData.cancelledBillRows,
          pendingRentNotice: paymentsData.pendingRentNotice?.message ?? null,
          electricityBillingPending: paymentsData.electricityBillingPending,
          electricityHistory: paymentsData.electricityHistory,
          historyHref: paymentsData.historyHref,
          lifetimeTotals: paymentsData.lifetimeTotals,
          payableNowTotalPaise: paymentsData.payableNowTotalPaise,
          payAll: paymentsData.payAll,
        }}
        requestsPanel={requestsPanel}
      />
    </>
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

  try {
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
        pendingDateChangePreview={data.primaryPendingDateChangePreview}
        settlementContext={data.primarySettlementContext}
        settlementDocument={data.primarySettlementDocument}
        settlementNoticeDisplay={data.primaryNoticeDisplay}
        exitBrainSnapshot={data.primaryExitBrainSnapshot}
      />
    </ResidentSectionErrorBoundary>
    );
  } catch (error) {
    logPortalLoaderFailure({
      section: 'requests_tab',
      customerId,
      bookingId: preloaded.primaryBooking?.bookingId ?? null,
      loader: 'ResidentRequestsTabSection',
      required: false,
      error,
    });
    return (
      <ResidentPortalSectionFallback
        section="requests"
        title="Requests could not load"
        message="Your move-out and service requests are safe. Please try again to view request status."
      />
    );
  }
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

  try {
    const referralSummary = await loadResidentReferralsTabData(customerId);
    return (
      <ReferralsPanel
        customerId={session.customerId}
        customerName={session.fullName || preloaded.customer.fullName || 'Resident'}
        referralSummary={referralSummary}
      />
    );
  } catch (error) {
    logPortalLoaderFailure({
      section: 'referrals_tab',
      customerId,
      bookingId: preloaded.primaryBooking?.bookingId ?? null,
      loader: 'ResidentReferralsTabSection',
      required: false,
      error,
    });
    return (
      <ResidentPortalSectionFallback
        section="referrals"
        title="Referrals could not load"
        message="Your referral rewards are safe. This section is temporarily unavailable — please try again."
      />
    );
  }
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

  try {
    const conciergeContext = await loadResidentConciergeTabData({ preloaded, session });
    if (!conciergeContext) return null;
    return <ResidentConciergeChat context={conciergeContext} />;
  } catch (error) {
    logPortalLoaderFailure({
      section: 'concierge_tab',
      customerId,
      bookingId: preloaded.primaryBooking?.bookingId ?? null,
      loader: 'ResidentConciergeTabSection',
      required: false,
      error,
    });
    return (
      <ResidentPortalSectionFallback
        section="concierge"
        title="Concierge could not load"
        message="Your stay and payment records are safe. Concierge is temporarily unavailable — please try again."
      />
    );
  }
}
