'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { BasketFlags, PaymentEntry, PaymentMethod } from '@/src/hair/domain/basket/types';

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
];

type Props = {
  grandTotalPaise: number;
  payments: PaymentEntry[];
  flags: BasketFlags;
  onChangePayments: (payments: PaymentEntry[]) => void;
  onChangeFlags: (flags: BasketFlags) => void;
};

export function QuickSalePaymentPanel({
  grandTotalPaise,
  payments,
  flags,
  onChangePayments,
  onChangeFlags,
}: Props) {
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMethod, setDraftMethod] = useState<PaymentMethod>('cash');

  const paidPaise = payments.reduce((s, p) => s + p.amountPaise, 0);
  const remainingPaise = Math.max(0, grandTotalPaise - paidPaise);
  const overpayPaise = Math.max(0, paidPaise - grandTotalPaise);
  const canAdvance =
    overpayPaise > 0 &&
    payments.some((p) => p.amountPaise > 0 && (p.method === 'cash' || p.method === 'card'));

  const addPayment = () => {
    const amountPaise = Math.round(Number(draftAmount || 0) * 100);
    if (amountPaise <= 0) return;
    onChangePayments([
      ...payments,
      { id: `pay-${Date.now()}`, method: draftMethod, amountPaise },
    ]);
    setDraftAmount('');
  };

  const summary = useMemo(
    () => ({
      paid: paidPaise,
      remaining: remainingPaise,
      overpay: overpayPaise,
    }),
    [paidPaise, remainingPaise, overpayPaise],
  );

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">Remaining</p>
        <p className="text-lg font-semibold tabular-nums text-fyh-forest">{formatInrFromPaise(summary.remaining)}</p>
        <p className="text-[11px] text-fyh-text-muted">
          Paid {formatInrFromPaise(summary.paid)} of {formatInrFromPaise(grandTotalPaise)}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[6rem] flex-1">
          <label className="mb-0.5 block text-[10px] font-medium text-fyh-text-muted">Amount ₹</label>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPayment();
              }
            }}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-fyh-text-muted">Method</label>
          <select
            value={draftMethod}
            onChange={(e) => setDraftMethod(e.target.value as PaymentMethod)}
            className="fyh-select h-9 min-w-[5.5rem] text-sm"
          >
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="secondary" className="h-9" onClick={addPayment}>
          Add
        </Button>
      </div>

      {payments.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--fyh-border)] bg-black/15 px-2 py-1"
            >
              <span className="capitalize text-fyh-text-secondary">{p.method}</span>
              <span className="tabular-nums font-semibold">{formatInrFromPaise(p.amountPaise)}</span>
              <button
                type="button"
                className="text-[11px] text-fyh-danger hover:underline"
                onClick={() => onChangePayments(payments.filter((x) => x.id !== p.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {canAdvance ? (
        <label className="flex items-center gap-2 text-xs text-fyh-text-secondary">
          <input
            type="checkbox"
            checked={flags.creditOverpayAsAdvance ?? false}
            onChange={(e) =>
              onChangeFlags({ ...flags, creditOverpayAsAdvance: e.target.checked })
            }
          />
          Mark overpay as advance ({formatInrFromPaise(summary.overpay)})
        </label>
      ) : null}

      {summary.remaining > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => onChangeFlags({ ...flags, markDue: true, markFullDue: false })}
          >
            Mark due ({formatInrFromPaise(summary.remaining)})
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => onChangeFlags({ ...flags, markFullDue: true, markDue: false })}
          >
            Full due
          </Button>
        </div>
      ) : null}
    </div>
  );
}
