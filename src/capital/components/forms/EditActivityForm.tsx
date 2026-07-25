'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  reverseVehicleActivityAction,
  updateVehicleActivityAction,
  type ActionState,
} from '@/src/capital/actions/activities';
import { FormField } from '@/src/capital/components/forms/FormField';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import {
  VEHICLE_ACTIVITY_TYPE_META,
  computeRepairSettlement,
  type VehicleActivityType,
} from '@/src/capital/lib/activityTypes';
import { formatInrPlain, paiseToRupees } from '@/src/capital/lib/money';

type Props = {
  activity: {
    id: string;
    activityType: string;
    activityAt: string;
    amountPaise: number | null;
    title: string | null;
    notes: string | null;
    metadata?: Record<string, unknown> | null;
  };
  advancePaise?: number;
  onDone?: () => void;
};

export function EditActivityForm({ activity, advancePaise, onDone }: Props) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const type = activity.activityType as VehicleActivityType;
  const meta = VEHICLE_ACTIVITY_TYPE_META[type];
  const isSettlement = type === 'repair_settlement';
  const isRepairAdvance = type === 'repair_advance';
  const locked = type === 'vehicle_created' || type === 'sale';

  const metaObj =
    activity.metadata && typeof activity.metadata === 'object' ? activity.metadata : {};
  const defaultActual =
    typeof metaObj.actualCostPaise === 'number'
      ? paiseToRupees(metaObj.actualCostPaise)
      : activity.amountPaise != null
        ? paiseToRupees(activity.amountPaise)
        : 0;
  const defaultReturned =
    typeof metaObj.returnedPaise === 'number' ? paiseToRupees(metaObj.returnedPaise) : 0;

  const form = useForm({
    defaultValues: {
      activityAt: activity.activityAt,
      amount: activity.amountPaise != null ? paiseToRupees(activity.amountPaise) : ('' as const),
      title: activity.title ?? '',
      notes: activity.notes ?? '',
      actualCost: defaultActual,
      returnedAmount: defaultReturned,
      reason: 'Correction',
    },
  });

  const actualCost = useWatch({ control: form.control, name: 'actualCost' });
  const returnedAmount = useWatch({ control: form.control, name: 'returnedAmount' });

  const settlementPreview = useMemo(() => {
    if (!isSettlement || advancePaise == null) return null;
    try {
      return computeRepairSettlement({
        advancePaise,
        actualCostPaise: Math.round(Number(actualCost || 0) * 100),
        returnedPaise: Math.round(Number(returnedAmount || 0) * 100),
      });
    } catch {
      return null;
    }
  }, [isSettlement, advancePaise, actualCost, returnedAmount]);

  if (!meta) return null;

  const onSave = form.handleSubmit((values) => {
    const fd = new FormData();
    fd.set('activityId', activity.id);
    fd.set('activityAt', values.activityAt);
    if (values.title) fd.set('title', values.title);
    if (values.notes) fd.set('notes', values.notes);
    if (isSettlement) {
      fd.set('actualCost', String(values.actualCost));
      fd.set('returnedAmount', String(values.returnedAmount));
    } else if (values.amount !== '' && values.amount != null) {
      fd.set('amount', String(values.amount));
    }
    startTransition(async () => {
      const result = await updateVehicleActivityAction(state, fd);
      if (result.error) setState({ error: result.error });
      else {
        setState({ success: result.success });
        onDone?.();
      }
    });
  });

  const onReverse = () => {
    const reason = form.getValues('reason') || 'Correction';
    const fd = new FormData();
    fd.set('id', activity.id);
    fd.set('reason', reason);
    startTransition(async () => {
      const result = await reverseVehicleActivityAction(state, fd);
      if (result.error) setState({ error: result.error });
      else {
        setState({ success: result.success });
        onDone?.();
      }
    });
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ac-text-muted">
        Edit · {meta.label}
      </p>
      {locked ? (
        <p className="text-sm text-ac-text-muted">This activity cannot be edited.</p>
      ) : (
        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date" name="activityAt" form={form}>
            <Input type="date" {...form.register('activityAt')} />
          </FormField>
          {isSettlement ? (
            <>
              <FormField label="Actual repair cost (₹)" name="actualCost" form={form}>
                <Input type="number" step="0.01" {...form.register('actualCost')} />
              </FormField>
              <FormField label="Money returned (₹)" name="returnedAmount" form={form}>
                <Input type="number" step="0.01" {...form.register('returnedAmount')} />
              </FormField>
              {settlementPreview && settlementPreview.additionalAmountRequiredPaise > 0 ? (
                <p className="sm:col-span-2 text-sm text-amber-200">
                  Additional amount required: ₹
                  {formatInrPlain(settlementPreview.additionalAmountRequiredPaise)}
                </p>
              ) : null}
            </>
          ) : meta.requiresAmount || isRepairAdvance ? (
            <FormField
              label={isRepairAdvance ? 'Advance given (₹)' : 'Amount (₹)'}
              name="amount"
              form={form}
            >
              <Input type="number" step="0.01" {...form.register('amount')} />
            </FormField>
          ) : null}
          <FormField label="Title" name="title" form={form}>
            <Input {...form.register('title')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Notes" name="notes" form={form}>
              <Textarea rows={2} {...form.register('notes')} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}

      {type !== 'vehicle_created' && type !== 'sale' ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
          <FormField label="Reverse reason" name="reason" form={form}>
            <Input {...form.register('reason')} />
          </FormField>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onReverse}>
            Reverse activity
          </Button>
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
    </div>
  );
}
