'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  recordFreeTextCostAction,
  reverseVehicleCostAction,
  updateExpectedInvestmentAction,
  updateSellerPriceAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { StableDateInput } from '@/src/components/forms/StableDateInput';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import { formatInrPlain } from '@/src/capital/lib/money';

const initialState: ActionState = {};

export type CostRow = {
  id: string;
  title: string | null;
  amountPaise: number;
  entryKind: string;
  occurredAt: string;
  notes?: string | null;
};

export function InvestmentBudgetPanel({
  assetId,
  expectedTotalInvestmentPaise,
  sellerPricePaise,
  currentInvestmentPaise,
  budgetRemainingPaise,
  costs,
  canEdit,
}: {
  assetId: string;
  expectedTotalInvestmentPaise: number;
  sellerPricePaise: number;
  currentInvestmentPaise: number;
  budgetRemainingPaise: number;
  costs: CostRow[];
  canEdit: boolean;
}) {
  const refresh = useRefreshCapitalView();
  const [expectedState, expectedAction, expectedPending] = useActionState(
    updateExpectedInvestmentAction,
    initialState,
  );
  const [sellerState, sellerAction, sellerPending] = useActionState(
    updateSellerPriceAction,
    initialState,
  );
  const [costState, costAction, costPending] = useActionState(
    recordFreeTextCostAction,
    initialState,
  );
  const [reverseState, reverseAction] = useActionState(reverseVehicleCostAction, initialState);

  const [expectedRupees, setExpectedRupees] = useState<number | undefined>(
    expectedTotalInvestmentPaise / 100,
  );
  const [sellerRupees, setSellerRupees] = useState<number | undefined>(
    sellerPricePaise > 0 ? sellerPricePaise / 100 : undefined,
  );
  const [costTitle, setCostTitle] = useState('');
  const [costAmount, setCostAmount] = useState<number | undefined>(undefined);
  const [entryKind, setEntryKind] = useState<'cost' | 'refund'>('cost');

  useEffect(() => {
    if (expectedState.success || sellerState.success || costState.success || reverseState.success) {
      refresh();
      if (costState.success) {
        setCostTitle('');
        setCostAmount(undefined);
      }
    }
  }, [
    expectedState.success,
    sellerState.success,
    costState.success,
    reverseState.success,
    refresh,
  ]);

  const costRows = costs.filter((c) => c.entryKind !== 'refund' && c.amountPaise >= 0);
  const refundRows = costs.filter((c) => c.entryKind === 'refund' || c.amountPaise < 0);
  const overBudget = budgetRemainingPaise < 0;

  return (
    <div className="space-y-4">
      <div className="ac-glass-card space-y-3 p-4 text-sm">
        <h3 className="font-semibold">Investment</h3>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/5 py-2">
          <div>
            <p className="text-ac-text-muted">Expected Total Investment</p>
            <MoneyDisplay paise={expectedTotalInvestmentPaise} className="text-base font-medium" />
          </div>
          {canEdit ? (
            <form action={expectedAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="assetId" value={assetId} />
              <CurrencyInput
                name="expectedTotalInvestment"
                allowNegative={false}
                value={expectedRupees ?? ''}
                onValueChange={setExpectedRupees}
                className="w-36"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={expectedPending}>
                Save
              </Button>
            </form>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/5 py-2">
          <div>
            <p className="text-ac-text-muted">Seller Price</p>
            <MoneyDisplay paise={sellerPricePaise} className="text-base font-medium" />
          </div>
          {canEdit ? (
            <form action={sellerAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="assetId" value={assetId} />
              <CurrencyInput
                name="sellerPrice"
                allowNegative={false}
                value={sellerRupees ?? ''}
                onValueChange={setSellerRupees}
                className="w-36"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={sellerPending}>
                Save
              </Button>
            </form>
          ) : null}
        </div>

        <div className="flex justify-between gap-4 border-b border-white/5 py-2">
          <span className="text-ac-text-muted">Current Investment</span>
          <MoneyDisplay paise={currentInvestmentPaise} className="font-semibold" />
        </div>
        <div className="flex justify-between gap-4 py-2">
          <span className="text-ac-text-muted">Budget Remaining</span>
          <span className={overBudget ? 'font-semibold text-ac-warning' : 'font-semibold'}>
            <MoneyDisplay paise={budgetRemainingPaise} />
          </span>
        </div>
        {overBudget ? (
          <p className="rounded-lg border border-ac-warning/40 bg-ac-warning/10 px-3 py-2 text-xs text-ac-warning">
            Over budget by ₹{formatInrPlain(Math.abs(budgetRemainingPaise))}. You can continue —
            this is a warning only.
          </p>
        ) : null}
        <p className="text-xs text-ac-text-muted">
          Current Investment = Seller Price + Costs − Refunds
        </p>
        {expectedState.error || sellerState.error ? (
          <p className="text-sm text-ac-danger">{expectedState.error || sellerState.error}</p>
        ) : null}
      </div>

      <div className="ac-glass-card space-y-3 p-4 text-sm">
        <h3 className="font-semibold">Costs</h3>
        {costRows.length === 0 ? (
          <p className="text-xs text-ac-text-muted">No costs yet.</p>
        ) : (
          <ul className="space-y-2">
            {costRows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-2">
                <div>
                  <p>{c.title || 'Cost'}</p>
                  <p className="text-xs text-ac-text-muted">{c.occurredAt}</p>
                </div>
                <div className="flex items-center gap-2">
                  <MoneyDisplay paise={c.amountPaise} />
                  {canEdit ? (
                    <form action={reverseAction}>
                      <input type="hidden" name="costId" value={c.id} />
                      <input type="hidden" name="assetId" value={assetId} />
                      <Button type="submit" size="sm" variant="ghost">
                        Undo
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="pt-2 font-semibold">Refunds</h3>
        {refundRows.length === 0 ? (
          <p className="text-xs text-ac-text-muted">No refunds yet.</p>
        ) : (
          <ul className="space-y-2">
            {refundRows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-2">
                <div>
                  <p>{c.title || 'Refund'}</p>
                  <p className="text-xs text-ac-text-muted">{c.occurredAt}</p>
                </div>
                <div className="flex items-center gap-2">
                  <MoneyDisplay paise={Math.abs(c.amountPaise)} />
                  {canEdit ? (
                    <form action={reverseAction}>
                      <input type="hidden" name="costId" value={c.id} />
                      <input type="hidden" name="assetId" value={assetId} />
                      <Button type="submit" size="sm" variant="ghost">
                        Undo
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form action={costAction} className="space-y-2 border-t border-white/10 pt-3">
            <input type="hidden" name="assetId" value={assetId} />
            <input type="hidden" name="entryKind" value={entryKind} />
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  entryKind === 'cost' ? 'bg-ac-accent/20 text-ac-accent' : 'bg-white/5'
                }`}
                onClick={() => setEntryKind('cost')}
              >
                Cost
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  entryKind === 'refund' ? 'bg-ac-accent/20 text-ac-accent' : 'bg-white/5'
                }`}
                onClick={() => setEntryKind('refund')}
              >
                Refund
              </button>
            </div>
            <Input
              name="title"
              placeholder="What for? (free text)"
              value={costTitle}
              onChange={(e) => setCostTitle(e.target.value)}
              required
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <CurrencyInput
                name="amount"
                allowNegative={false}
                value={costAmount ?? ''}
                onValueChange={setCostAmount}
                placeholder="Amount (₹)"
                required
              />
              <StableDateInput
                name="occurredAt"
                required
                className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ac-text placeholder:text-ac-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Button type="submit" size="sm" disabled={costPending}>
              {costPending ? 'Saving…' : entryKind === 'refund' ? 'Add refund' : 'Add cost'}
            </Button>
            {costState.error ? <p className="text-sm text-ac-danger">{costState.error}</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
