'use client';

import { usePathname } from 'next/navigation';
import { ownerSectionLabelForPath } from '@/src/owner/lib/ownerNav';

export function OwnerMobileSectionTitle() {
  const pathname = usePathname();
  const section = ownerSectionLabelForPath(pathname ?? '/dashboard');

  return (
    <div className="min-w-0 md:hidden">
      <p className="truncate text-base font-semibold leading-tight text-white">{section}</p>
    </div>
  );
}
