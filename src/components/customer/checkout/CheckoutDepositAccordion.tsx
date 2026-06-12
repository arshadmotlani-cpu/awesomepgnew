'use client';

import { useId, useState } from 'react';
import {
  DEPOSIT_REFUND_BLOCKERS,
  DEPOSIT_REFUND_FAST_HOURS,
  DEPOSIT_REFUND_MAX_HOURS,
  DEPOSIT_REFUND_PERCENT_LABEL,
} from '@/src/lib/depositPolicy';
import { paiseToInr } from '@/src/lib/format';

export function CheckoutDepositAccordion({ depositPaise }: { depositPaise: number }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const depositLabel = paiseToInr(depositPaise);

  return (
    <section className="apg-glass rounded-2xl p-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-4 text-left transition hover:bg-white/[0.03]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-semibold text-white">Refundable deposit information</span>
        <span
          className={
            'text-apg-orange transition-transform duration-200 ' + (open ? 'rotate-90' : '')
          }
          aria-hidden
        >
          ▶
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="space-y-2 border-t border-white/10 px-4 py-4 text-sm leading-relaxed text-apg-silver"
        >
          <p>
            <span className="font-semibold text-white">{depositLabel}</span> deposit is fully
            refundable when you check out with no outstanding dues.
          </p>
          <p>
            {DEPOSIT_REFUND_PERCENT_LABEL} of eligible deposits are processed within{' '}
            {DEPOSIT_REFUND_FAST_HOURS} hours (maximum {DEPOSIT_REFUND_MAX_HOURS} hours).
          </p>
          <p className="text-apg-muted">{DEPOSIT_REFUND_BLOCKERS}</p>
        </div>
      ) : null}
    </section>
  );
}
