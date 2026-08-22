import type { ReactNode } from 'react';

/** No ERP sidebar/header — select-org must not prefetch /dashboard/revenue. */
export default function SelectOrganizationLayout({ children }: { children: ReactNode }) {
  return children;
}
