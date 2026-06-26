'use client';

import { useState } from 'react';

export function KycLazyDocumentImage({
  label,
  src,
}: {
  label: string;
  src: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-white/5"
      >
        <span>{label}</span>
        <span className="text-xs text-apg-silver">{expanded ? 'Hide' : 'Show image'}</span>
      </button>
      {expanded ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="max-h-96 w-full object-contain bg-black/40" loading="lazy" />
      ) : null}
    </div>
  );
}
