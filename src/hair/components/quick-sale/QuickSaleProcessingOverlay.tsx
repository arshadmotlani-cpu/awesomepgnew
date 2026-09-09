'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

export function QuickSaleProcessingIndicator({ label = 'Processing…' }: { label?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="qs-processing-indicator"
      role="status"
      aria-live="polite"
      data-testid="qs-processing-indicator"
    >
      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
      <span>{label}</span>
    </div>,
    document.body,
  );
}

export function QuickSaleInteractionShield() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="qs-interaction-shield" aria-hidden="true" data-testid="qs-interaction-shield" />,
    document.body,
  );
}

export function QuickSaleCheckoutProcessing({ label = 'Processing…' }: { label?: string }) {
  return (
    <>
      <QuickSaleInteractionShield />
      <QuickSaleProcessingIndicator label={label} />
    </>
  );
}
