'use client';

import Link from 'next/link';
import { ResidentControlShell } from '@/src/components/world/ResidentControlShell';
import { type ResidentTab, residentTabHref } from '@/src/lib/accountNavigation';
import { RESIDENT_DESKTOP_NAV } from '@/src/lib/residentNavigation';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { DeveloperTestResidentPanel } from '@/src/components/customer/account/resident/DeveloperTestResidentPanel';
import type { DevResidentDurationMode } from '@/src/lib/auth/developerTestResident.shared';

type Props = {
  activeTab: ResidentTab;
  children: React.ReactNode;
  developerTestMode?: boolean;
  customerId?: string | null;
  customerEmail?: string | null;
  bookingId?: string | null;
  actualDurationMode?: string | null;
  simulatedDurationMode?: DevResidentDurationMode | null;
};

export function ResidentHubShell({
  activeTab,
  children,
  developerTestMode = false,
  customerId = null,
  customerEmail = null,
  bookingId = null,
  actualDurationMode = null,
  simulatedDurationMode = null,
}: Props) {
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
            bookingId={bookingId}
            actualDurationMode={actualDurationMode}
            simulatedDurationMode={simulatedDurationMode}
          />
        ) : null}

        <nav
          className="apg-resident-top-nav mb-4 flex gap-1 overflow-x-auto scroll-smooth rounded-xl border border-white/10 bg-white/[0.03] p-1 snap-x snap-mandatory md:flex-wrap md:overflow-visible"
          aria-label="Resident hub"
        >
          {RESIDENT_DESKTOP_NAV.map(({ tab, label }) => (
            <Link
              key={tab}
              href={residentTabHref(tab)}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-apg-orange/15 text-apg-orange ring-1 ring-apg-orange/30'
                  : 'text-apg-silver hover:bg-white/5 hover:text-white'
              }`}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <ResidentSectionErrorBoundary
          page={`resident_portal_${activeTab}`}
          bookingId={bookingId}
          customerId={customerId}
          email={customerEmail}
          title="Your stay dashboard could not load"
        >
          <div className="min-w-0 space-y-6">{children}</div>
        </ResidentSectionErrorBoundary>
      </div>
    </ResidentControlShell>
  );
}

export function ResidentPanel({
  tab,
  activeTab,
  children,
}: {
  tab: ResidentTab | ResidentTab[];
  activeTab: ResidentTab;
  children: React.ReactNode;
}) {
  const tabs = Array.isArray(tab) ? tab : [tab];
  if (!tabs.includes(activeTab)) return null;
  return <div data-resident-panel={tabs.join(',')}>{children}</div>;
}
