'use client';

import type { ReactNode } from 'react';
import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function ResidentMoreSection({
  title = 'More',
  description = 'Extra details and less common actions.',
  children,
  defaultOpen = false,
  className = '',
}: Props) {
  return (
    <details
      open={defaultOpen}
      className={`group ${ACCOUNT_SURFACE} ${className}`}
    >
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
            <p className="mt-0.5 text-xs text-zinc-600">{description}</p>
          </div>
          <span className="text-zinc-500 transition group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </div>
      </summary>
      <div className="space-y-4 border-t border-zinc-200 px-5 py-4">{children}</div>
    </details>
  );
}
