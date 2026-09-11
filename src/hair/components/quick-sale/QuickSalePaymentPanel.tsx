'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { BasketFlags, PaymentEntry, PaymentMethod } from '@/src/hair/domain/basket/types';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  QUICK_SALE_PAYMENT_METHODS,
  quickSalePaymentMethodLabel,
} from '@/src/hair/lib/quickSalePaymentMethods';
import {
  clearDueFlagsIfFullyPaid,
  computePaymentPanelSummary,
  flagsForMarkRemainingDue,
  formatDraftAmountFromPaise,
  mergeDueFlags,
  parseDraftAmountRupee,
  validateDraftPayment,
} from '@/src/hair/lib/quickSalePaymentPanelState';

type Props = {
  grandTotalPaise: number;
  payments: PaymentEntry[];
  flags: BasketFlags;
  locked?: boolean;
  onChangePayments: (payments: PaymentEntry[]) => void;
  onChangeFlags: (flags: BasketFlags) => void;
};

function SummaryRow({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          muted
            ? 'text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted'
            : 'text-[11px] font-medium text-fyh-text-secondary'
        }
      >
        {label}
      </span>
      <span
        className={
          accent
            ? 'fyh-money-value-accent text-lg font-semibold tabular-nums'
            : 'text-sm font-semibold tabular-nums text-fyh-text'
        }
      >
        {value}
      </span>
    </div>
  );
}

export function QuickSalePaymentPanel({
  grandTotalPaise,
  payments,
  flags,
  locked = false,
  onChangePayments,
  onChangeFlags,
}: Props) {
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMethod, setDraftMethod] = useState<PaymentMethod | ''>('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const isEditingAmountRef = useRef(false);
  const lastPrefillRemainingRef = useRef<number | null>(null);

  const summary = useMemo(
    () => computePaymentPanelSummary({ grandTotalPaise, payments, flags }),
    [grandTotalPaise, payments, flags],
  );

  const canAdvance =
    summary.overpayPaise > 0 &&
    payments.some((p) => p.amountPaise > 0 && (p.method === 'cash' || p.method === 'card'));

  useEffect(() => {
    if (isEditingAmountRef.current) return;
    if (summary.isZeroTotal) {
      setDraftAmount('');
      setDraftError(null);
      lastPrefillRemainingRef.current = null;
      return;
    }
    if (summary.remainingToAllocatePaise <= 0) {
      setDraftAmount('');
      setDraftError(null);
      lastPrefillRemainingRef.current = 0;
      return;
    }
    if (lastPrefillRemainingRef.current === summary.remainingToAllocatePaise) return;
    lastPrefillRemainingRef.current = summary.remainingToAllocatePaise;
    setDraftAmount(formatDraftAmountFromPaise(summary.remainingToAllocatePaise));
    setDraftError(null);
  }, [summary.isZeroTotal, summary.remainingToAllocatePaise]);

  const syncFlagsAfterPayments = (nextPayments: PaymentEntry[]) => {
    const nextPaid = nextPayments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    onChangeFlags(clearDueFlagsIfFullyPaid(flags, nextPaid, grandTotalPaise));
  };

  const addPayment = () => {
    const draftPaise = parseDraftAmountRupee(draftAmount);
    const validationError = validateDraftPayment({
      draftPaise,
      remainingToAllocatePaise: summary.remainingToAllocatePaise,
    });
    if (validationError) {
      setDraftError(validationError);
      return;
    }
    if (!draftMethod) {
      setDraftError('Select a payment method');
      return;
    }

    const nextPayments = [
      ...payments,
      { id: `pay-${Date.now()}`, method: draftMethod, amountPaise: draftPaise },
    ];
    onChangePayments(nextPayments);
    syncFlagsAfterPayments(nextPayments);
    setDraftMethod('');
    setDraftError(null);
    isEditingAmountRef.current = false;
    lastPrefillRemainingRef.current = null;
  };

  const removePayment = (paymentId: string) => {
    const nextPayments = payments.filter((payment) => payment.id !== paymentId);
    onChangePayments(nextPayments);
    const nextSummary = computePaymentPanelSummary({
      grandTotalPaise,
      payments: nextPayments,
      flags,
    });
    if (nextSummary.remainingToAllocatePaise > 0 && (flags.markDue || flags.markFullDue)) {
      onChangeFlags({ ...flags, markDue: false, markFullDue: false });
    } else {
      syncFlagsAfterPayments(nextPayments);
    }
    isEditingAmountRef.current = false;
    lastPrefillRemainingRef.current = null;
  };

  const markRemainingAsDue = () => {
    if (summary.remainingToAllocatePaise <= 0) return;
    onChangeFlags(
      mergeDueFlags(
        flags,
        flagsForMarkRemainingDue({
          paidPaise: summary.paidPaise,
          remainingPaise: summary.remainingToAllocatePaise,
        }),
      ),
    );
    setDraftError(null);
    isEditingAmountRef.current = false;
    lastPrefillRemainingRef.current = 0;
    setDraftAmount('');
  };

  if (summary.isZeroTotal) {
    return (
      <div className="rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 py-3">
        <p className="text-sm font-medium text-fyh-text">Package redemption</p>
        <p className="mt-1 text-xs text-fyh-text-muted">No payment required for this sale.</p>
      </div>
    );
  }

  const canAddPayment =
    !locked &&
    summary.remainingToAllocatePaise > 0 &&
    draftMethod !== '' &&
    parseDraftAmountRupee(draftAmount) > 0 &&
    !validateDraftPayment({
      draftPaise: parseDraftAmountRupee(draftAmount),
      remainingToAllocatePaise: summary.remainingToAllocatePaise,
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2.5">
        <SummaryRow label="Total" value={formatInrFromPaise(grandTotalPaise)} accent />
        <SummaryRow label="Paid" value={formatInrFromPaise(summary.paidPaise)} />
        {summary.isDueMarked ? (
          <SummaryRow label="Due" value={formatInrFromPaise(summary.duePaise)} />
        ) : null}
        {summary.remainingToAllocatePaise > 0 ? (
          <SummaryRow
            label="Remaining to allocate"
            value={formatInrFromPaise(summary.remainingToAllocatePaise)}
            muted
          />
        ) : summary.isComplete ? (
          <p className="pt-1 text-xs font-medium text-fyh-forest">Payment complete</p>
        ) : null}
      </div>

      {summary.remainingToAllocatePaise > 0 ? (
        <div className="space-y-2 rounded-lg border border-[color:var(--fyh-border)] bg-black/10 px-3 py-2.5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">
              Amount received
            </label>
            <Input
              inputMode="decimal"
              placeholder="0"
              disabled={locked}
              value={draftAmount}
              onFocus={() => {
                isEditingAmountRef.current = true;
              }}
              onBlur={() => {
                isEditingAmountRef.current = false;
              }}
              onChange={(e) => {
                setDraftAmount(e.target.value);
                setDraftError(null);
              }}
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
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">
              Payment method
            </label>
            <select
              value={draftMethod}
              disabled={locked}
              onChange={(e) => {
                setDraftMethod(e.target.value as PaymentMethod | '');
                setDraftError(null);
              }}
              className="fyh-select h-9 w-full text-sm"
            >
              <option value="">Select method</option>
              {QUICK_SALE_PAYMENT_METHODS.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          {draftError ? <p className="text-xs text-fyh-danger">{draftError}</p> : null}
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-full text-sm font-medium"
            disabled={!canAddPayment}
            onClick={addPayment}
          >
            + Add Payment
          </Button>
        </div>
      ) : null}

      {payments.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">
            Payments received
          </p>
          <ul className="divide-y divide-[color:var(--fyh-border)] rounded-lg border border-[color:var(--fyh-border)] bg-black/10">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="text-fyh-text-secondary">
                  {quickSalePaymentMethodLabel(payment.method)}
                </span>
                <span className="tabular-nums font-semibold text-fyh-text">
                  {formatInrFromPaise(payment.amountPaise)}
                </span>
                <button
                  type="button"
                  className="h-7 w-7 rounded-md text-base leading-none text-fyh-text-muted hover:bg-black/20 hover:text-fyh-danger"
                  disabled={locked}
                  aria-label={`Remove ${quickSalePaymentMethodLabel(payment.method)} payment`}
                  onClick={() => removePayment(payment.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between px-1 text-xs text-fyh-text-secondary">
            <span>Total paid</span>
            <span className="tabular-nums font-semibold text-fyh-text">
              {formatInrFromPaise(summary.paidPaise)}
            </span>
          </div>
        </div>
      ) : null}

      {canAdvance ? (
        <label className="flex items-center gap-2 text-xs text-fyh-text-secondary">
          <input
            type="checkbox"
            disabled={locked}
            checked={flags.creditOverpayAsAdvance ?? false}
            onChange={(e) =>
              onChangeFlags({ ...flags, creditOverpayAsAdvance: e.target.checked })
            }
          />
          Mark overpay as advance ({formatInrFromPaise(summary.overpayPaise)})
        </label>
      ) : null}

      {summary.remainingToAllocatePaise > 0 && !summary.isDueMarked ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-center border border-[color:var(--fyh-border)] text-sm"
          disabled={locked}
          onClick={markRemainingAsDue}
        >
          Mark {formatInrFromPaise(summary.remainingToAllocatePaise)} as Due
        </Button>
      ) : null}
    </div>
  );
}
