'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  createVehicleActivityAction,
  type ActionState,
} from '@/src/capital/actions/activities';
import { FormField } from '@/src/capital/components/forms/FormField';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import {
  SELECTABLE_ACTIVITY_TYPES,
  VEHICLE_ACTIVITY_TYPE_META,
  type VehicleActivityType,
} from '@/src/capital/lib/activityTypes';
import { formatInrPlain } from '@/src/capital/lib/money';

type OpenAdvance = {
  id: string;
  advancePaise: number;
  outstandingPaise: number;
};

type FormValues = {
  activityType: VehicleActivityType;
  activityAt: string;
  amount: number | '';
  title: string;
  notes: string;
  actualCost: number | '';
  returnedAmount: number | '';
  repairAdvanceId: string;
};

export function CreateActivityForm({
  assetId,
  openAdvances = [],
}: {
  assetId: string;
  openAdvances?: OpenAdvance[];
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<FormValues>({
    defaultValues: {
      activityType: 'token_paid',
      activityAt: new Date().toISOString().slice(0, 10),
      amount: '',
      title: '',
      notes: '',
      actualCost: '',
      returnedAmount: '',
      repairAdvanceId: openAdvances[0]?.id ?? '',
    },
  });

  const activityType = useWatch({ control: form.control, name: 'activityType' });
  const meta = VEHICLE_ACTIVITY_TYPE_META[activityType];
  const isSettlement = activityType === 'repair_settlement';
  const requiresAmount = meta.requiresAmount && !isSettlement;

  const repairAdvanceId = useWatch({ control: form.control, name: 'repairAdvanceId' });
  const selectedAdvance = useMemo(
    () => openAdvances.find((a) => a.id === repairAdvanceId),
    [openAdvances, repairAdvanceId],
  );

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    fd.set('assetId', assetId);
    fd.set('activityType', values.activityType);
    fd.set('activityAt', values.activityAt);
    if (values.title) fd.set('title', values.title);
    if (values.notes) fd.set('notes', values.notes);
    if (isSettlement) {
      fd.set('actualCost', String(values.actualCost === '' ? 0 : values.actualCost));
      fd.set('returnedAmount', String(values.returnedAmount === '' ? 0 : values.returnedAmount));
      if (values.repairAdvanceId) fd.set('repairAdvanceId', values.repairAdvanceId);
    } else if (values.amount !== '' && values.amount != null) {
      fd.set('amount', String(values.amount));
    }

    startTransition(async () => {
      const result = await createVehicleActivityAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Activity recorded');
        form.reset({
          activityType: values.activityType,
          activityAt: new Date().toISOString().slice(0, 10),
          amount: '',
          title: '',
          notes: '',
          actualCost: '',
          returnedAmount: '',
          repairAdvanceId: openAdvances[0]?.id ?? '',
        });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <FormField label="Activity type" name="activityType" form={form}>
        <select
          id="activityType"
          className="ac-input w-full"
          {...form.register('activityType')}
        >
          {SELECTABLE_ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {VEHICLE_ACTIVITY_TYPE_META[t].label}
              {VEHICLE_ACTIVITY_TYPE_META[t].costImpact === 'vehicle_cost'
                ? ' · cost'
                : VEHICLE_ACTIVITY_TYPE_META[t].costImpact === 'cash_only'
                  ? ' · cash'
                  : ''}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Date" name="activityAt" form={form}>
        <Input id="activityAt" type="date" {...form.register('activityAt')} required />
      </FormField>

      {isSettlement ? (
        <>
          {openAdvances.length === 0 ? (
            <p className="text-sm text-amber-300">
              No open repair advance. Record a Repair Advance first.
            </p>
          ) : (
            <FormField label="Open advance" name="repairAdvanceId" form={form}>
              <select
                id="repairAdvanceId"
                className="ac-input w-full"
                {...form.register('repairAdvanceId')}
              >
                {openAdvances.map((a) => (
                  <option key={a.id} value={a.id}>
                    Advance ₹{formatInrPlain(a.advancePaise)}
                    {a.outstandingPaise !== a.advancePaise
                      ? ` (outstanding ₹${formatInrPlain(a.outstandingPaise)})`
                      : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {selectedAdvance ? (
            <p className="text-xs text-ac-text-muted">
              Advance float: ₹{formatInrPlain(selectedAdvance.advancePaise)}. Only actual cost
              hits Net Vehicle Cost; returns restore cash.
            </p>
          ) : null}
          <FormField label="Actual repair cost (₹)" name="actualCost" form={form}>
            <Input
              id="actualCost"
              type="number"
              step="0.01"
              min="0"
              {...form.register('actualCost')}
              required
            />
          </FormField>
          <FormField label="Amount returned (₹)" name="returnedAmount" form={form}>
            <Input
              id="returnedAmount"
              type="number"
              step="0.01"
              min="0"
              {...form.register('returnedAmount')}
            />
          </FormField>
        </>
      ) : requiresAmount ? (
        <FormField label="Amount (₹)" name="amount" form={form}>
          <Input id="amount" type="number" step="0.01" {...form.register('amount')} required />
        </FormField>
      ) : null}

      <FormField label="Title (optional)" name="title" form={form}>
        <Input id="title" {...form.register('title')} placeholder={meta.label} />
      </FormField>

      <FormField label="Notes" name="notes" form={form}>
        <Textarea id="notes" rows={2} {...form.register('notes')} />
      </FormField>

      <Button type="submit" disabled={pending || (isSettlement && openAdvances.length === 0)}>
        {pending ? 'Saving…' : 'Add activity'}
      </Button>
    </form>
  );
}
