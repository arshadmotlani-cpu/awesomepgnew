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
  investor2Label: string;
};

export function UpdateFundingForm({
  assetId,
  purchasePricePaise,
  fundingGapPaise,
  investors,
}: {
  assetId: string;
  purchasePricePaise: number;
  fundingGapPaise: number;
  investors: { slot: string; label: string; investedPaise: number }[];
}) {
  const me = investors.find((i) => i.slot === 'me');
  const i2 = investors.find((i) => i.slot === 'investor_2');
  const purchaseRupees = paiseToRupees(purchasePricePaise);

  const form = useForm<FundingFormValues>({
    defaultValues: {
      meInvested: paiseToRupees(me?.investedPaise ?? 0),
      investor2Invested: paiseToRupees(i2?.investedPaise ?? 0),
      investor2Label: i2?.label ?? 'Partner',
    },
  });

  const [state, formAction, pending] = useActionState(updateAssetFundingAction, initialState);
  const meInvested = useWatch({ control: form.control, name: 'meInvested' });
  const investor2Invested = useWatch({ control: form.control, name: 'investor2Invested' });

  const fundingTotal = (meInvested ?? 0) + (investor2Invested ?? 0);
  const fundingOk = useMemo(
    () => Math.round(fundingTotal * 100) === Math.round(purchaseRupees * 100),
    [fundingTotal, purchaseRupees],
  );

  const gapLabel =
    fundingGapPaise === 0
      ? 'Fully funded vs purchase price'
      : fundingGapPaise > 0
        ? `Underfunded by ₹${formatInrPlain(fundingGapPaise)}`
        : `Overfunded by ₹${formatInrPlain(-fundingGapPaise)}`;

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <div>
        <h3 className="font-medium">Update investments</h3>
        <p className="mt-1 text-xs text-ac-text-muted">
          My Investment + Partner must equal purchase price.
        </p>
        <p
          className={`mt-2 text-sm ${fundingGapPaise === 0 ? 'text-ac-success' : 'text-ac-warning'}`}
        >
          {gapLabel}
        </p>
      </div>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="purchasePriceRupees" value={purchaseRupees} />

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
        <FormField label="Partner name" name="investor2Label" form={form}>
          <Input {...form.register('investor2Label')} name="investor2Label" />
        </FormField>
        <FormField label="Partner Investment (₹)" name="investor2Invested" form={form}>
          <Input
            type="number"
            step="1"
            min={0}
            {...form.register('investor2Invested', { valueAsNumber: true })}
            name="investor2Invested"
          />
        </FormField>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
        <span className={fundingOk ? 'text-ac-success' : 'text-ac-danger'}>
          ₹{formatInrPlain(Math.round(fundingTotal * 100))} / ₹
          {formatInrPlain(Math.round(purchaseRupees * 100))}
          {fundingOk ? ' · balanced' : ' · must equal purchase price'}
        </span>
      </div>

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}

      <Button type="submit" disabled={pending || !fundingOk}>
        {pending ? 'Saving…' : 'Save investments'}
      </Button>
    </form>
  );
}
