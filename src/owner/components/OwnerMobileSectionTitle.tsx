'use client';

import { usePathname } from 'next/navigation';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import { ownerSectionLabelForPath } from '@/src/owner/lib/ownerNav';

export function OwnerMobileSectionTitle() {
  const pathname = usePathname();
  const section = ownerSectionLabelForPath(pathname ?? '/dashboard');

  return (
    <div className="min-w-0 md:hidden">
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-[#FF5A1F]">
        {OWNER_OS.name}
      </p>
      <p className="truncate text-base font-semibold leading-tight text-white">{section}</p>
    </div>
  );
}
