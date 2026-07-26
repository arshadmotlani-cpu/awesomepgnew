'use client';

import { useActionState, useState } from 'react';
import {
  recordPurchasePaymentAction,
  type ActionState,
} from '@/src/capital/actions/activities';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { formatInrPlain } from '@/src/capital/lib/money';

const initialState: ActionState = {};

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
  remainingPaise: number;
  milestones: Array<{
    id: string;
    activityType: string;
    activityAt: string;
    amountPaise: number | null;
    label: string;
  }>;
  canEdit: boolean;
  highlight?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    recordPurchasePaymentAction,
    initialState,
  );
  const [amount, setAmount] = useState('');
  const complete = purchasePricePaise > 0 && remainingPaise <= 0;

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

      <div className="space-y-1">
        <div className="flex justify-between gap-4 py-1">
          <span className="text-ac-text-muted">Purchase Price</span>
          <MoneyDisplay paise={purchasePricePaise} />
        </div>
        <div className="flex justify-between gap-4 py-1">
          <span className="text-ac-text-muted">Already Paid</span>
          <MoneyDisplay paise={alreadyPaidPaise} />
        </div>
        <div className="flex justify-between gap-4 border-t border-white/10 py-2 font-semibold">
          <span>Remaining</span>
          {complete ? (
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
                {a.label} · {a.activityAt}
              </span>
              {a.amountPaise != null ? <MoneyDisplay paise={a.amountPaise} /> : null}
            </div>
          ))}
        </div>
      )}

      {canEdit && purchasePricePaise > 0 && !complete ? (
        <form action={formAction} className="space-y-3 border-t border-white/10 pt-3">
          <input type="hidden" name="assetId" value={assetId} />
          <div>
            <label className="mb-1 block text-sm text-ac-text-secondary">
              Record Purchase Payment (₹)
            </label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Up to ₹${formatInrPlain(remainingPaise)}`}
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
          {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Record Purchase Payment'}
          </Button>
        </form>
      ) : null}

      {canEdit && purchasePricePaise <= 0 ? (
        <p className="text-xs text-ac-text-muted">
          Set a purchase price on the vehicle to track seller payment progress.
        </p>
      ) : null}
    </div>
  );
}
