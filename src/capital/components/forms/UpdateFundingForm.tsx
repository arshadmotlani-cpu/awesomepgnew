'use client';

import { useActionState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  updateAssetFundingAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { FormField } from '@/src/capital/components/forms/FormField';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { formatInrPlain, paiseToRupees } from '@/src/capital/lib/money';

const initialState: ActionState = {};

type FundingFormValues = {
  meInvested: number;
  investor2Invested: number;
  investor3Invested: number;
  investor2Label: string;
  investor3Label: string;
};

export function UpdateFundingForm({
  assetId,
  netVehicleCostPaise,
  fundingGapPaise,
  investors,
}: {
  assetId: string;
  netVehicleCostPaise: number;
  fundingGapPaise: number;
  investors: { slot: string; label: string; investedPaise: number }[];
}) {
  const me = investors.find((i) => i.slot === 'me');
  const i2 = investors.find((i) => i.slot === 'investor_2');
  const i3 = investors.find((i) => i.slot === 'investor_3');
  const netRupees = paiseToRupees(netVehicleCostPaise);

  const form = useForm<FundingFormValues>({
    defaultValues: {
      meInvested: paiseToRupees(me?.investedPaise ?? 0),
      investor2Invested: paiseToRupees(i2?.investedPaise ?? 0),
      investor3Invested: paiseToRupees(i3?.investedPaise ?? 0),
      investor2Label: i2?.label ?? 'Investor 2',
      investor3Label: i3?.label ?? 'Investor 3',
    },
  });

  const [state, formAction, pending] = useActionState(updateAssetFundingAction, initialState);
  const meInvested = useWatch({ control: form.control, name: 'meInvested' });
  const investor2Invested = useWatch({ control: form.control, name: 'investor2Invested' });
  const investor3Invested = useWatch({ control: form.control, name: 'investor3Invested' });

  const fundingTotal = (meInvested ?? 0) + (investor2Invested ?? 0) + (investor3Invested ?? 0);
  const fundingOk = useMemo(
    () => Math.round(fundingTotal * 100) === Math.round(netRupees * 100),
    [fundingTotal, netRupees],
  );

  const gapLabel =
    fundingGapPaise === 0
      ? 'Fully funded'
      : fundingGapPaise > 0
        ? `Underfunded by ₹${formatInrPlain(fundingGapPaise)}`
        : `Overfunded by ₹${formatInrPlain(-fundingGapPaise)}`;

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <div>
        <h3 className="font-medium">Update investments</h3>
        <p className="mt-1 text-xs text-ac-text-muted">
          Total investment must equal net vehicle cost (purchase + repairs − refunds).
        </p>
        <p
          className={`mt-2 text-sm ${fundingGapPaise === 0 ? 'text-ac-success' : 'text-ac-warning'}`}
        >
          {gapLabel}
        </p>
      </div>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="netVehicleCostRupees" value={netRupees} />

      <FormField label="My Investment (₹)" name="meInvested" form={form}>
        <Input
          type="number"
          step="1"
          min={0}
          {...form.register('meInvested', { valueAsNumber: true })}
          name="meInvested"
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Investor 2 — name" name="investor2Label" form={form}>
          <Input {...form.register('investor2Label')} name="investor2Label" />
        </FormField>
        <FormField label="Investor 2 — invested (₹)" name="investor2Invested" form={form}>
          <Input
            type="number"
            step="1"
            min={0}
            {...form.register('investor2Invested', { valueAsNumber: true })}
            name="investor2Invested"
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Investor 3 — name" name="investor3Label" form={form}>
          <Input {...form.register('investor3Label')} name="investor3Label" />
        </FormField>
        <FormField label="Investor 3 — invested (₹)" name="investor3Invested" form={form}>
          <Input
            type="number"
            step="1"
            min={0}
            {...form.register('investor3Invested', { valueAsNumber: true })}
            name="investor3Invested"
          />
        </FormField>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ac-text-muted">Total investment</span>
          <span className={fundingOk ? 'text-ac-success' : 'text-ac-danger'}>
            ₹{formatInrPlain(Math.round(fundingTotal * 100))}
            {fundingOk ? ' · balanced' : ' · must match net cost'}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-ac-text-muted">Net vehicle cost</span>
          <span>₹{formatInrPlain(netVehicleCostPaise)}</span>
        </div>
      </div>

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" disabled={pending || !fundingOk}>
        Save investments
      </Button>
    </form>
  );
}
