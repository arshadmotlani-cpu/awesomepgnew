'use client';

import { useEffect, useState } from 'react';
import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';

export const FINANCIAL_WORKSPACE_SECTIONS = [
  { id: 'checkout', label: 'Checkout Settlement' },
  { id: 'move-out', label: 'Move-out Settlement' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'refund', label: 'Refund' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
] as const;

export type FinancialWorkspaceSectionId = (typeof FINANCIAL_WORKSPACE_SECTIONS)[number]['id'];

function sectionFromHash(hash: string): FinancialWorkspaceSectionId | null {
  const id = hash.replace(/^#/, '');
  if (FINANCIAL_WORKSPACE_SECTIONS.some((s) => s.id === id)) {
    return id as FinancialWorkspaceSectionId;
  }
  return null;
}

export function BookingFinancialWorkspaceNav({
  bookingId,
  defaultSectionWhenEmpty,
}: {
  bookingId: string;
  /** When URL has no hash, scroll here (e.g. checkout during active settlement). */
  defaultSectionWhenEmpty: FinancialWorkspaceSectionId;
}) {
  const [active, setActive] = useState<FinancialWorkspaceSectionId>(defaultSectionWhenEmpty);

  useEffect(() => {
    const sync = () => {
      const fromHash = sectionFromHash(window.location.hash);
      const target = fromHash ?? defaultSectionWhenEmpty;
      setActive(target);
      if (!fromHash && defaultSectionWhenEmpty !== 'accounting') {
        const next = `#${defaultSectionWhenEmpty}`;
        if (window.location.hash !== next) {
          window.history.replaceState(null, '', `${window.location.pathname}${next}`);
        }
      }
      const el = document.getElementById(target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [defaultSectionWhenEmpty]);

  return (
    <nav className="mt-4 flex flex-wrap gap-2">
      {FINANCIAL_WORKSPACE_SECTIONS.map((section) => {
        const isActive = active === section.id;
        return (
          <a
            key={section.id}
            href={bookingFinancialWorkspaceSectionHref(bookingId, section.id)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition ' +
              (isActive
                ? 'border-apg-orange/50 bg-apg-orange/15 text-white'
                : 'border-white/10 text-apg-silver hover:border-apg-orange/40 hover:text-white')
            }
          >
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
