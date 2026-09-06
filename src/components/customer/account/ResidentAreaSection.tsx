import { Suspense } from 'react';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import {
  ResidentConciergeTabSection,
  ResidentPaymentsTabSection,
  ResidentProfileTabSection,
  ResidentReferralsTabSection,
  ResidentRequestsTabSection,
} from '@/src/components/customer/account/ResidentAreaAsyncSections';
import {
  ResidentConciergeTabSkeleton,
  ResidentPaymentsTabSkeleton,
  ResidentProfileTabSkeleton,
  ResidentReferralsTabSkeleton,
  ResidentRequestsTabSkeleton,
} from '@/src/components/customer/account/ResidentPortalSkeletons';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  isDeveloperTestResidentEmail,
  parseDevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { getCustomerSession } from '@/src/lib/auth/session';
import type { ResidentTab, ResidentProfileSub, ResidentPaymentsSub } from '@/src/lib/accountNavigation';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import type { ResidentAccountContext } from '@/src/services/residentAccountContext';
import { cookies } from 'next/headers';

/**
 * Resident billing dashboard — shell + tab-scoped Suspense sections.
 * Preloaded context from the page avoids duplicate ResidentAccountContext loading.
 */
export async function ResidentAreaSection({
  preloaded,
  customerId,
  activeTab = 'profile',
  profileSub = 'overview',
  paymentsSub = 'due',
  editExpanded = false,
  requestsQuery = {},
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  activeTab?: ResidentTab;
  profileSub?: ResidentProfileSub;
  paymentsSub?: ResidentPaymentsSub;
  editExpanded?: boolean;
  requestsQuery?: {
    requestId?: string;
    make?: boolean;
    category?: import('@/src/lib/residents/requestCenter').RequestCategoryId;
  };
}) {
  const session = await getCustomerSession();
  if (!session || session.customerId !== customerId) {
    return null;
  }

  const developerTestMode = isDeveloperTestResidentEmail(session.email);
  const cookieStore = await cookies();
  const simulatedDurationMode = developerTestMode
    ? parseDevResidentDurationMode(cookieStore.get(DEV_RESIDENT_DURATION_COOKIE)?.value)
    : null;

  const primaryBooking = preloaded.primaryBooking;
  const portalReady = hasResidentPortalReadyStay(preloaded);

  return (
    <ResidentHubShell
      activeTab={activeTab}
      developerTestMode={developerTestMode}
      customerId={session.customerId}
      customerEmail={session.email}
      bookingId={primaryBooking?.bookingId ?? null}
      actualDurationMode={primaryBooking?.durationMode ?? null}
      simulatedDurationMode={simulatedDurationMode}
    >
      {!portalReady && preloaded.hasResidentPortalAccess ? (
        <ResidentIncompleteStayPanel
          customerEmail={session.email}
          developerTestMode={developerTestMode}
        />
      ) : null}

      {activeTab === 'profile' && primaryBooking ? (
        <Suspense fallback={<ResidentProfileTabSkeleton />}>
          <ResidentSectionErrorBoundary
            page="resident_profile_tab"
            customerId={customerId}
            email={session.email}
            bookingId={primaryBooking.bookingId}
            title="Profile could not load"
          >
            <ResidentProfileTabSection
              preloaded={preloaded}
              customerId={customerId}
              profileSub={profileSub}
              editExpanded={editExpanded}
              developerTestMode={developerTestMode}
            />
          </ResidentSectionErrorBoundary>
        </Suspense>
      ) : null}

      {activeTab === 'payments' && primaryBooking ? (
        <Suspense fallback={<ResidentPaymentsTabSkeleton />}>
          <ResidentSectionErrorBoundary
            page="resident_payments_tab"
            customerId={customerId}
            email={session.email}
            bookingId={primaryBooking.bookingId}
            title="Payments could not load"
          >
            <ResidentPaymentsTabSection
              preloaded={preloaded}
              customerId={customerId}
              paymentsSub={paymentsSub}
            />
          </ResidentSectionErrorBoundary>
        </Suspense>
      ) : null}

      {activeTab === 'requests' && primaryBooking ? (
        <Suspense fallback={<ResidentRequestsTabSkeleton />}>
          <ResidentSectionErrorBoundary
            page="resident_requests_tab"
            customerId={customerId}
            email={session.email}
            bookingId={primaryBooking.bookingId}
            title="Requests could not load"
          >
            <ResidentRequestsTabSection
              preloaded={preloaded}
              customerId={customerId}
              developerTestMode={developerTestMode}
              requestsQuery={requestsQuery}
            />
          </ResidentSectionErrorBoundary>
        </Suspense>
      ) : null}

      {activeTab === 'referrals' ? (
        <Suspense fallback={<ResidentReferralsTabSkeleton />}>
          <ResidentSectionErrorBoundary
            page="resident_referrals_tab"
            customerId={customerId}
            email={session.email}
            bookingId={primaryBooking?.bookingId ?? null}
            title="Referrals could not load"
          >
            <ResidentReferralsTabSection preloaded={preloaded} customerId={customerId} />
          </ResidentSectionErrorBoundary>
        </Suspense>
      ) : null}

      {activeTab === 'concierge' && primaryBooking ? (
        <Suspense fallback={<ResidentConciergeTabSkeleton />}>
          <ResidentSectionErrorBoundary
            page="resident_concierge_tab"
            customerId={customerId}
            email={session.email}
            bookingId={primaryBooking.bookingId}
            title="Concierge could not load"
          >
            <ResidentConciergeTabSection preloaded={preloaded} customerId={customerId} />
          </ResidentSectionErrorBoundary>
        </Suspense>
      ) : null}
    </ResidentHubShell>
  );
}
