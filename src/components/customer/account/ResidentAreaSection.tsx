import { Suspense } from 'react';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import {
  ResidentConciergeTabSection,
  ResidentReferralsTabSection,
} from '@/src/components/customer/account/ResidentAreaAsyncSections';
import {
  ResidentConciergeTabSkeleton,
  ResidentReferralsTabSkeleton,
} from '@/src/components/customer/account/ResidentPortalSkeletons';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  isDeveloperTestResidentEmail,
  parseDevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { getCustomerSession } from '@/src/lib/auth/session';
import type { ResidentTab } from '@/src/lib/accountNavigation';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import type { ResidentAccountContext } from '@/src/services/residentAccountContext';
import { cookies } from 'next/headers';

/** Profile account features — Referrals and Concierge. */
export async function ResidentAreaSection({
  preloaded,
  customerId,
  activeTab = 'referrals',
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  activeTab?: ResidentTab;
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
