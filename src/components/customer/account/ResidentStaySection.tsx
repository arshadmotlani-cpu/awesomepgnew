import { Suspense } from 'react';
import { ResidentControlShell } from '@/src/components/world/ResidentControlShell';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { ResidentStayTabSection } from '@/src/components/customer/account/ResidentAreaAsyncSections';
import { ResidentStayTabSkeleton } from '@/src/components/customer/account/ResidentPortalSkeletons';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  isDeveloperTestResidentEmail,
  parseDevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { getCustomerSession } from '@/src/lib/auth/session';
import type { ResidentPaymentsSub, ResidentStaySub } from '@/src/lib/accountNavigation';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import type { ResidentAccountContext } from '@/src/services/residentAccountContext';
import type { RequestCategoryId } from '@/src/lib/residents/requestCenter';
import { cookies } from 'next/headers';
import { DeveloperTestResidentPanel } from '@/src/components/customer/account/resident/DeveloperTestResidentPanel';

/** My Stay — Overview, Payments, Requests, Wallet. */
export async function ResidentStaySection({
  preloaded,
  customerId,
  staySub = 'payments',
  paymentsSub = 'due',
  requestsQuery = {},
}: {
  preloaded: ResidentAccountContext;
  customerId: string;
  staySub?: ResidentStaySub;
  paymentsSub?: ResidentPaymentsSub;
  requestsQuery?: {
    requestId?: string;
    make?: boolean;
    category?: RequestCategoryId;
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
    <ResidentControlShell>
      <div className="apg-resident-hub-main min-w-0 overflow-x-clip">
        {developerTestMode ? (
          <div
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200"
            role="status"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-violet-300" />
            Developer Test Mode
          </div>
        ) : null}

        {developerTestMode ? (
          <DeveloperTestResidentPanel
            bookingId={primaryBooking?.bookingId ?? null}
            actualDurationMode={primaryBooking?.durationMode ?? null}
            simulatedDurationMode={simulatedDurationMode}
          />
        ) : null}

        {!portalReady && preloaded.hasResidentPortalAccess ? (
          <ResidentIncompleteStayPanel
            customerEmail={session.email}
            developerTestMode={developerTestMode}
          />
        ) : null}

        {primaryBooking ? (
          <Suspense fallback={<ResidentStayTabSkeleton />}>
            <ResidentSectionErrorBoundary
              page={`resident_stay_${staySub}`}
              customerId={customerId}
              email={session.email}
              bookingId={primaryBooking.bookingId}
              title="My Stay could not load"
            >
              <ResidentStayTabSection
                preloaded={preloaded}
                customerId={customerId}
                staySub={staySub}
                paymentsSub={paymentsSub}
                developerTestMode={developerTestMode}
                requestsQuery={requestsQuery}
              />
            </ResidentSectionErrorBoundary>
          </Suspense>
        ) : null}
      </div>
    </ResidentControlShell>
  );
}
