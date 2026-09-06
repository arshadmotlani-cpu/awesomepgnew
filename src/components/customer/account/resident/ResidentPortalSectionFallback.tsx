'use client';

import { ResidentPortalRefreshButton } from '@/src/components/customer/account/resident/ResidentPortalRefreshButton';

type Props = {
  title: string;
  message?: string;
  section: string;
};

/** Localized optional-section failure — does not replace the whole portal shell. */
export function ResidentPortalSectionFallback({
  title,
  message = 'Some details are temporarily unavailable. Your booking and payments are safe — please try again.',
  section,
}: Props) {
  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5"
      data-resident-section-fallback={section}
    >
      <p className="text-sm font-semibold text-amber-100">{title}</p>
      <p className="mt-2 text-sm text-amber-50/90">{message}</p>
      <ResidentPortalRefreshButton className="mt-4" label="Try again" />
    </div>
  );
}
