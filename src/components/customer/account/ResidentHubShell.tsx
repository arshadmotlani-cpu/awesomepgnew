'use client';

import Link from 'next/link';
import { ResidentControlShell } from '@/src/components/world/ResidentControlShell';
import { RESIDENT_BOTTOM_NAV, type ResidentTab, residentTabHref } from '@/src/lib/accountNavigation';
import {
  RESIDENT_DESKTOP_NAV,
  RESIDENT_MOBILE_SECONDARY_TABS,
  residentTabMeta,
} from '@/src/lib/residentNavigation';

type Props = {
  activeTab: ResidentTab;
  children: React.ReactNode;
};

export function ResidentHubShell({ activeTab, children }: Props) {
  const tabMeta = residentTabMeta(activeTab);

  return (
    <ResidentControlShell>
      <div className="apg-resident-hub-main min-w-0">
        <nav
          className="mb-3 hidden flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 md:flex"
          aria-label="Resident hub"
        >
          {RESIDENT_DESKTOP_NAV.map(({ tab, label }) => (
            <Link
              key={tab}
              href={residentTabHref(tab)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

        <nav
          className="mb-4 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 md:hidden [-webkit-overflow-scrolling:touch]"
          aria-label="More resident sections"
        >
          {RESIDENT_MOBILE_SECONDARY_TABS.map(({ tab, label }) => (
            <Link
              key={tab}
              href={residentTabHref(tab)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === tab
                  ? 'border-apg-orange/40 bg-apg-orange/15 text-apg-orange'
                  : 'border-white/10 bg-white/[0.03] text-apg-silver hover:border-white/20 hover:text-white'
              }`}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="mb-4 md:hidden">
          <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
            {tabMeta.title}
          </p>
          <p className="mt-0.5 text-sm text-apg-silver">{tabMeta.subtitle}</p>
        </div>

        <div className="min-w-0 space-y-6">{children}</div>

        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-apg-charcoal/95 backdrop-blur-md md:hidden"
          aria-label="Resident navigation"
        >
          <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {RESIDENT_BOTTOM_NAV.map(({ tab, label, icon }) => (
              <li key={tab} className="min-w-0 flex-1">
                <Link
                  href={residentTabHref(tab)}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition ${
                    activeTab === tab ? 'text-apg-orange' : 'text-apg-silver'
                  }`}
                  aria-current={activeTab === tab ? 'page' : undefined}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {icon}
                  </span>
                  <span className="truncate max-w-full">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
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
