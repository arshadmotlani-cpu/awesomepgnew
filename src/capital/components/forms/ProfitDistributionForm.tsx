'use client';

import { useActionState } from 'react';
import {
  updateProfitDistributionModeAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { Button } from '@/src/capital/components/ui/button';
import { profitDistributionLabel, type ProfitDistributionMode } from '@/src/capital/lib/dealEconomics';

const initialState: ActionState = {};

export function ProfitDistributionForm({
  assetId,
  mode,
}: {
  assetId: string;
  mode: ProfitDistributionMode;
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
          Current: {profitDistributionLabel(mode)}. Changing this recalculates My Profit, Sufii
          Profit, ROI, and dashboard totals.
        </p>
      </div>
      <input type="hidden" name="assetId" value={assetId} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Profit Distribution</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="profitDistributionMode"
            value="SELF"
            defaultChecked={mode === 'SELF'}
            key={`${mode}-SELF`}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-ac-text">Entire profit is mine</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="profitDistributionMode"
            value="PARTNERSHIP_50_50"
            defaultChecked={mode === 'PARTNERSHIP_50_50'}
            key={`${mode}-PARTNERSHIP`}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-ac-text">Split profit 50% / 50%</span>
          </span>
        </label>
      </fieldset>
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save distribution'}
      </Button>
    </form>
  );
}
