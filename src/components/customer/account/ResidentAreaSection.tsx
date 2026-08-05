import { Suspense } from 'react';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
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
  const hasConfirmedBookingWithoutDetail = preloaded.hasResidentPortalAccess;

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
      {!primaryBooking && hasConfirmedBookingWithoutDetail ? (
        <ResidentIncompleteStayPanel
          customerEmail={session.email}
          developerTestMode={developerTestMode}
        />
      ) : null}

      {activeTab === 'profile' && primaryBooking ? (
        <Suspense fallback={<ResidentProfileTabSkeleton />}>
          <ResidentProfileTabSection
            preloaded={preloaded}
            customerId={customerId}
            profileSub={profileSub}
            editExpanded={editExpanded}
            developerTestMode={developerTestMode}
          />
        </Suspense>
      ) : null}

      {activeTab === 'payments' && primaryBooking ? (
        <Suspense fallback={<ResidentPaymentsTabSkeleton />}>
          <ResidentPaymentsTabSection
            preloaded={preloaded}
            customerId={customerId}
            paymentsSub={paymentsSub}
          />
        </Suspense>
      ) : null}

      {activeTab === 'requests' && primaryBooking ? (
        <Suspense fallback={<ResidentRequestsTabSkeleton />}>
          <ResidentRequestsTabSection
            preloaded={preloaded}
            customerId={customerId}
            developerTestMode={developerTestMode}
            requestsQuery={requestsQuery}
          />
        </Suspense>
      ) : null}

      {activeTab === 'referrals' ? (
        <Suspense fallback={<ResidentReferralsTabSkeleton />}>
          <ResidentReferralsTabSection preloaded={preloaded} customerId={customerId} />
        </Suspense>
      ) : null}

      {activeTab === 'concierge' && primaryBooking ? (
        <Suspense fallback={<ResidentConciergeTabSkeleton />}>
          <ResidentConciergeTabSection preloaded={preloaded} customerId={customerId} />
        </Suspense>
      ) : null}
    </ResidentHubShell>
  );
}
