'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  recordPurchasePaymentAction,
  type ActionState,
} from '@/src/capital/actions/activities';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import { formatInrPlain } from '@/src/capital/lib/money';
import { SELLER_PAYMENT_INSTRUMENT_LABELS } from '@/src/capital/lib/threeLedgers';

const initialState: ActionState = {};

const INSTRUMENTS = ['cash', 'upi', 'neft', 'rtgs', 'cheque', 'bank'] as const;

const selectClass =
  'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text';

export function RecordPurchasePaymentForm({
  assetId,
  purchasePricePaise,
  alreadyPaidPaise,
  remainingPaise,
  milestones,
  canEdit,
  highlight = false,
}: {
  assetId: string;
  purchasePricePaise: number;
  alreadyPaidPaise: number;
  /** Null when purchase price is not set — do not fabricate Remaining ₹0. */
  remainingPaise: number | null;
  milestones: Array<{
    id: string;
    activityType: string;
    activityAt: string;
    amountPaise: number | null;
    label: string;
    instrument?: string | null;
  }>;
  canEdit: boolean;
  highlight?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    recordPurchasePaymentAction,
    initialState,
  );
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const refreshCapitalView = useRefreshCapitalView();
  const priceSet = purchasePricePaise > 0;
  const complete = priceSet && remainingPaise != null && remainingPaise <= 0;
  const orphanPayments = !priceSet && alreadyPaidPaise > 0;

  useEffect(() => {
    if (state.success) {
      setAmount(undefined);
      refreshCapitalView();
    }
  }, [state.success, refreshCapitalView]);

  return (
    <div
      id="purchase-payment"
      className={`ac-glass-card space-y-3 p-4 text-sm ${
        highlight ? 'ring-1 ring-ac-accent/40' : ''
      }`}
    >
      <div>
        <p className="font-medium">Purchase Payment</p>
        <p className="mt-1 text-xs text-ac-text-muted">
          Cash paid to the seller toward Purchase Price. Token and these payments do not add to
          Total Vehicle Investment.
        </p>
      </div>

      {orphanPayments ? (
        <p className="rounded-lg border border-ac-warning/40 bg-ac-warning/10 px-3 py-2 text-sm text-ac-warning">
          Purchase Price not set, but {milestones.length} seller payment
          {milestones.length === 1 ? '' : 's'} exist (
          <MoneyDisplay paise={alreadyPaidPaise} />). Set Purchase Price on Edit vehicle before
          remaining or funding status can be calculated.
        </p>
      ) : null}

      <div className="space-y-1">
        <div className="flex justify-between gap-4 py-1">
          <span className="text-ac-text-muted">Purchase Price</span>
          {priceSet ? (
            <MoneyDisplay paise={purchasePricePaise} />
          ) : (
            <span className="text-ac-warning">Purchase Price not set</span>
          )}
        </div>
        <div className="flex justify-between gap-4 py-1">
          <span className="text-ac-text-muted">Already Paid</span>
          <MoneyDisplay paise={alreadyPaidPaise} />
        </div>
        <div className="flex justify-between gap-4 border-t border-white/10 py-2 font-semibold">
          <span>Remaining</span>
          {!priceSet || remainingPaise == null ? (
            <span className="font-normal text-ac-text-muted">— (set purchase price)</span>
          ) : complete ? (
            <span className="text-ac-success">₹0 · Purchase Complete</span>
          ) : (
            <MoneyDisplay paise={remainingPaise} />
          )}
        </div>
      </div>

      {milestones.length === 0 ? (
        <p className="text-ac-text-muted">No payments recorded yet.</p>
      ) : (
        <div className="space-y-1 border-t border-white/5 pt-2">
          {milestones.map((a) => (
            <div key={a.id} className="flex justify-between gap-4 py-1.5">
              <span>
                {a.label}
                {a.instrument
                  ? ` · ${
                      SELLER_PAYMENT_INSTRUMENT_LABELS[
                        a.instrument as keyof typeof SELLER_PAYMENT_INSTRUMENT_LABELS
                      ] ?? a.instrument
                    }`
                  : ''}{' '}
                · {a.activityAt}
              </span>
              {a.amountPaise != null ? <MoneyDisplay paise={a.amountPaise} /> : null}
            </div>
          ))}
        </div>
      )}

      {canEdit && priceSet && !complete ? (
        <form action={formAction} className="space-y-3 border-t border-white/10 pt-3">
          <input type="hidden" name="assetId" value={assetId} />
          <div>
            <label className="mb-1 block text-sm text-ac-text-secondary">
              Record Purchase Payment (₹)
            </label>
            <CurrencyInput
              name="amount"
              allowNegative={false}
              value={amount ?? ''}
              onValueChange={setAmount}
              required
              placeholder={`Up to ₹${formatInrPlain(remainingPaise ?? 0)}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ac-text-secondary">Payment date</label>
            <Input
              name="paidAt"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ac-text-secondary">Payment instrument</label>
            <select name="instrument" className={selectClass} defaultValue="bank">
              {INSTRUMENTS.map((m) => (
                <option key={m} value={m}>
                  {SELLER_PAYMENT_INSTRUMENT_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ac-text-secondary">
              Notes (optional)
            </label>
            <Textarea name="notes" rows={2} placeholder="Optional" />
          </div>
          {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
          <Button type="submit" size="sm" disabled={pending || amount == null || amount <= 0}>
            {pending ? 'Saving…' : 'Record Purchase Payment'}
          </Button>
        </form>
      ) : null}

      {canEdit && !priceSet && !orphanPayments ? (
        <p className="text-xs text-ac-text-muted">
          Set a purchase price on the vehicle to track seller payment progress.
        </p>
      ) : null}
    </div>
  );
}
