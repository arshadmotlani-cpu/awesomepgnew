'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/src/hair/components/ui/input';
import {
  normalizeDiscountPercentOnBlur,
  overridePricePaiseForDiscountPercent,
  parseDiscountPercentDraft,
  wholeDiscountPercentFromBps,
} from '@/src/hair/lib/quickSaleDiscountPercent';

type Props = {
  lineId: string;
  discountBps: number;
  catalogGrossPaise: number;
  disabled?: boolean;
  onCommit: (overridePricePaise: number) => void;
};

function commitPercent(catalogGrossPaise: number, percent: number): number {
  return overridePricePaiseForDiscountPercent(catalogGrossPaise, percent);
}

export function QuickSaleDiscountPercentInput({
  lineId,
  discountBps,
  catalogGrossPaise,
  disabled = false,
  onCommit,
}: Props) {
  const committedPercent = wholeDiscountPercentFromBps(discountBps);
  const [draft, setDraft] = useState(() => String(committedPercent));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(committedPercent));
    }
  }, [lineId, committedPercent]);

  const applyPercent = (percent: number) => {
    onCommit(commitPercent(catalogGrossPaise, percent));
  };

  return (
    <Input
      inputMode="numeric"
      pattern="[0-9]*"
      step={1}
      min={0}
      max={100}
      disabled={disabled}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseDiscountPercentDraft(raw);
        if (parsed.status === 'valid') {
          applyPercent(parsed.percent);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        const normalized = normalizeDiscountPercentOnBlur(draft, committedPercent);
        applyPercent(normalized);
        setDraft(String(normalized));
      }}
      className="h-8 w-14 text-right text-xs tabular-nums"
      aria-label="Discount percent"
      title="Whole-number discount 0–100%"
      data-testid="qs-discount-percent-input"
    />
  );
}
