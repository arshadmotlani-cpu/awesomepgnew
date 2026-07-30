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
    <div className="space-y-4 rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fyh-text">Payment</h3>
        <span className="text-sm tabular-nums text-fyh-text-muted">
          Remaining{' '}
          <span className="font-medium text-fyh-text">
            {formatInrFromPaise(summary.remaining)}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="Amount ₹"
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          className="h-10 w-32"
        />
        <select
          value={draftMethod}
          onChange={(e) => setDraftMethod(e.target.value as PaymentMethod)}
          className="h-10 rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm"
        >
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={addPayment}>
          Add Payment
        </Button>
      </div>

      {payments.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="capitalize text-fyh-text-secondary">{p.method}</span>
              <span className="tabular-nums">{formatInrFromPaise(p.amountPaise)}</span>
              <button
                type="button"
                className="text-xs text-fyh-danger"
                onClick={() => onChangePayments(payments.filter((x) => x.id !== p.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {canAdvance ? (
        <label className="flex items-center gap-2 text-sm text-blue-400">
          <input
            type="checkbox"
            checked={flags.creditOverpayAsAdvance ?? false}
            onChange={(e) =>
              onChangeFlags({ ...flags, creditOverpayAsAdvance: e.target.checked })
            }
          />
          Mark remaining as Advance ({formatInrFromPaise(summary.overpay)})
        </label>
      ) : null}

      {summary.remaining > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChangeFlags({ ...flags, markDue: true, markFullDue: false })}
          >
            Mark as Due ({formatInrFromPaise(summary.remaining)})
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChangeFlags({ ...flags, markFullDue: true, markDue: false })
            }
          >
            Mark Full Due
          </Button>
        </div>
      ) : null}
    </div>
  );
}
