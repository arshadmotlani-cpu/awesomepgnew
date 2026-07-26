'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createPaymentAction, type ActionState } from '@/src/capital/actions/payments';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { createPaymentSchema, type CreatePaymentInput } from '@/src/capital/lib/validation/schemas';
import { paymentModeEnum, paymentTypeEnum } from '@/src/capital/db/schema/enums';

const DRAFT_KEY = 'payment-new';

type AssetOption = { id: string; label: string };

export function CreatePaymentForm({
  assets,
  defaultAssetId,
}: {
  assets: AssetOption[];
  defaultAssetId?: string;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();
  const refreshCapitalView = useRefreshCapitalView();

  const form = useForm<CreatePaymentInput>({
    resolver: capitalZodResolver(createPaymentSchema),
    defaultValues: {
      assetId: defaultAssetId ?? '',
      receivedAt: new Date().toISOString().slice(0, 10),
      amount: 0,
      paymentType: 'capital_returned',
      capitalReturned: 0,
      profit: 0,
      adjustment: 0,
      paymentMode: 'bank',
    },
  });

  const watchAmount = useWatch({ control: form.control, name: 'amount' });
  const watchCapitalReturned = useWatch({ control: form.control, name: 'capitalReturned' });
  const watchProfit = useWatch({ control: form.control, name: 'profit' });
  const watchAdjustment = useWatch({ control: form.control, name: 'adjustment' });

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload) form.reset({ ...form.getValues(), ...payload } as CreatePaymentInput);
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control);

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined) fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await createPaymentAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Payment recorded');
        form.reset({
          assetId: values.assetId,
          receivedAt: new Date().toISOString().slice(0, 10),
          amount: 0,
          paymentType: 'capital_returned',
          capitalReturned: 0,
          profit: 0,
          adjustment: 0,
          paymentMode: 'bank',
        });
        refreshCapitalView();
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <FormField label="Asset" name="assetId" form={form}>
            <select
              id="assetId"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('assetId')}
            >
              <option value="">General (no asset)</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date *" name="receivedAt" form={form}>
            <Input id="receivedAt" type="date" {...form.register('receivedAt')} />
          </FormField>
          <FormField label="Total amount (₹) *" name="amount" form={form}>
            <CurrencyInput
              id="amount"
              allowNegative={false}
              value={watchAmount ?? ''}
              onValueChange={(v) =>
                form.setValue('amount', (v ?? 0) as CreatePaymentInput['amount'], {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField label="Payment type *" name="paymentType" form={form}>
            <select
              id="paymentType"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('paymentType')}
            >
              {paymentTypeEnum.enumValues.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Capital returned (₹)" name="capitalReturned" form={form}>
            <CurrencyInput
              id="capitalReturned"
              allowNegative={false}
              value={watchCapitalReturned ?? ''}
              onValueChange={(v) =>
                form.setValue('capitalReturned', (v ?? 0) as CreatePaymentInput['capitalReturned'], {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField label="Profit (₹)" name="profit" form={form}>
            <CurrencyInput
              id="profit"
              allowNegative={false}
              value={watchProfit ?? ''}
              onValueChange={(v) =>
                form.setValue('profit', (v ?? 0) as CreatePaymentInput['profit'], {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField label="Adjustment (₹)" name="adjustment" form={form}>
            <CurrencyInput
              id="adjustment"
              allowNegative={false}
              value={watchAdjustment ?? ''}
              onValueChange={(v) =>
                form.setValue('adjustment', (v ?? 0) as CreatePaymentInput['adjustment'], {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField label="Mode *" name="paymentMode" form={form}>
            <select
              id="paymentMode"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('paymentMode')}
            >
              {paymentModeEnum.enumValues.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reference" name="referenceNumber" form={form}>
            <Input id="referenceNumber" {...form.register('referenceNumber')} />
          </FormField>
          <FormField label="Notes" name="notes" form={form} className="md:col-span-2">
            <Textarea id="notes" {...form.register('notes')} />
          </FormField>
          {state.error ? <p className="text-sm text-ac-danger md:col-span-2">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success md:col-span-2">{state.success}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Record payment'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
