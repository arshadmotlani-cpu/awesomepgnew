'use client';

import type { ReactNode } from 'react';

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function AdminAdvancedToolsSection({
  title = 'Advanced tools',
  description = 'Rare or sensitive actions — use only when you know what you need.',
  children,
  defaultOpen = false,
  className = '',
}: Props) {
  return (
    <details
      open={defaultOpen}
      className={`group mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] ${className}`}
    >
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-apg-silver">{description}</p>
          </div>
          <span className="text-apg-silver transition group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </div>
      </summary>
      <div className="space-y-6 border-t border-white/10 px-5 py-4">{children}</div>
    </details>
  );
}
