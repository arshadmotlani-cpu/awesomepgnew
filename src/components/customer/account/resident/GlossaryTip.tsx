'use client';

import type { ReactNode } from 'react';

type Props = {
  term: string;
  children: ReactNode;
  className?: string;
};

/** Plain-language definition on tap/hover for resident-facing jargon. */
export function GlossaryTip({ term, children, className = '' }: Props) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      <button
        type="button"
        className="cursor-help border-b border-dotted border-zinc-400 text-inherit underline-offset-2 hover:border-[#FF5A1F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F]/40"
        aria-describedby={`glossary-${term.replace(/\s+/g, '-')}`}
      >
        {children}
      </button>
      <span
        id={`glossary-${term.replace(/\s+/g, '-')}`}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-snug text-zinc-700 shadow-lg group-hover:block group-focus-within:block"
      >
        {term}
      </span>
    </span>
  );
}
