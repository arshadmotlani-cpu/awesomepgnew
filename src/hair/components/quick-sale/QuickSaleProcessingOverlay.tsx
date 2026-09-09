'use client';

import { Loader2 } from 'lucide-react';

export function QuickSaleProcessingOverlay({ label = 'Processing…' }: { label?: string }) {
  return (
    <div
      className="qs-processing-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="qs-processing-overlay"
    >
      <div className="qs-processing-banner">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
