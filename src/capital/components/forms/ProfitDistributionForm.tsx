'use client';

import { useActionState } from 'react';
import {
  updateProfitDistributionModeAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { Button } from '@/src/capital/components/ui/button';
import { profitDistributionLabel, type ProfitDistributionMode } from '@/src/capital/lib/dealEconomics';

const initialState: ActionState = {};

const selectClass =
  'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac-accent/40';

export function ProfitDistributionForm({
  assetId,
  mode,
  hasSale,
}: {
  assetId: string;
  mode: ProfitDistributionMode;
  hasSale: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfitDistributionModeAction,
    initialState,
  );

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Profit Distribution</h3>
        <p className="mt-1 text-xs text-ac-text-muted">
          Current: {profitDistributionLabel(mode)}.
          {hasSale
            ? ' Changing this recalculates My Profit, Sufii Profit, ROI, and dashboard totals.'
            : ' Applies when you record the sale.'}
        </p>
      </div>
      <input type="hidden" name="assetId" value={assetId} />
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Mode</label>
        <select
          name="profitDistributionMode"
          className={selectClass}
          defaultValue={mode}
          key={mode}
        >
          <option value="SELF">Self — 100% my profit</option>
          <option value="PARTNERSHIP_50_50">Partnership — 50% me / 50% Sufii</option>
        </select>
      </div>
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save distribution'}
      </Button>
    </form>
  );
}
