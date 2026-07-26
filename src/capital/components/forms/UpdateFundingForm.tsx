'use client';

import { useActionState, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  updateAssetFundingAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { FormField } from '@/src/capital/components/forms/FormField';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import { formatInrPlain, paiseToRupees } from '@/src/capital/lib/money';

const initialState: ActionState = {};

type FundingFormValues = {
  meInvested: number | undefined;
  investor2Invested: number | undefined;
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
  const hadPartner = (i2?.investedPaise ?? 0) > 0;
  const [withPartner, setWithPartner] = useState(hadPartner);
  const refreshCapitalView = useRefreshCapitalView();

  const form = useForm<FundingFormValues>({
    defaultValues: {
      meInvested: paiseToRupees(me?.investedPaise ?? purchasePricePaise),
      investor2Invested: paiseToRupees(i2?.investedPaise ?? 0),
      investor2Label: i2?.label ?? 'Partner',
    },
  });

  const [state, formAction, pending] = useActionState(updateAssetFundingAction, initialState);
  const meInvested = useWatch({ control: form.control, name: 'meInvested' });
  const investor2Invested = useWatch({ control: form.control, name: 'investor2Invested' });

  useEffect(() => {
    if (!withPartner) {
      form.setValue('meInvested', purchaseRupees, { shouldValidate: false });
      form.setValue('investor2Invested', 0, { shouldValidate: false });
    }
  }, [withPartner, purchaseRupees, form]);

  useEffect(() => {
    if (state.success) refreshCapitalView();
  }, [state.success, refreshCapitalView]);

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
          My Investment + Partner (optional) must equal purchase price. Checked when you save.
          Separate from seller Purchase Payment progress.
        </p>
        <p
          className={`mt-2 text-sm ${fundingGapPaise === 0 ? 'text-ac-success' : 'text-ac-warning'}`}
        >
          {gapLabel}
        </p>
      </div>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="purchasePriceRupees" value={purchaseRupees} />
      <input
        type="hidden"
        name="meInvested"
        value={withPartner ? String(meInvested ?? 0) : String(purchaseRupees)}
      />
      <input
        type="hidden"
        name="investor2Invested"
        value={withPartner ? String(investor2Invested ?? 0) : '0'}
      />
      <input
        type="hidden"
        name="investor2Label"
        value={withPartner ? form.watch('investor2Label') : ''}
      />

      <FormField label="My Investment (₹)" name="meInvested" form={form}>
        <CurrencyInput
          allowNegative={false}
          value={meInvested ?? ''}
          onValueChange={(v) => form.setValue('meInvested', v, { shouldValidate: true })}
          readOnly={!withPartner}
          className={!withPartner ? 'opacity-80' : undefined}
        />
      </FormField>

      <div className="rounded-lg border border-white/10 bg-white/[0.02]">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-ac-text-secondary hover:text-ac-text"
          onClick={() => setWithPartner((v) => !v)}
        >
          <span aria-hidden>{withPartner ? '▼' : '▶'}</span>
          <span>Partner Investment (Optional)</span>
        </button>
        {withPartner ? (
          <div className="grid gap-3 border-t border-white/10 px-3 py-3 sm:grid-cols-2">
            <FormField label="Partner Name" name="investor2Label" form={form}>
              <Input {...form.register('investor2Label')} />
            </FormField>
            <FormField label="Partner Investment (₹)" name="investor2Invested" form={form}>
              <CurrencyInput
                allowNegative={false}
                value={investor2Invested ?? ''}
                onValueChange={(v) =>
                  form.setValue('investor2Invested', v, { shouldValidate: true })
                }
              />
            </FormField>
          </div>
        ) : null}
      </div>

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save investments'}
      </Button>
    </form>
  );
}
