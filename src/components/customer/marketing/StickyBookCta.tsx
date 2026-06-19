'use client';

import Link from 'next/link';
import { primaryBtn } from '@/src/lib/design-system/tokens';

type Props = {
  href: string;
  label: string;
};

export function StickyBookCta({ href, label }: Props) {
  return (
    <div className="apg-sticky-cta">
      <Link href={href} className={`${primaryBtn} w-full`}>
        {label}
      </Link>
    </div>
  );
}
