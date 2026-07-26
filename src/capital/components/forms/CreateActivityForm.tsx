'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  createVehicleActivityAction,
  type ActionState,
} from '@/src/capital/actions/activities';
import { updateStatusAction } from '@/src/capital/actions/assets';
import { FormField } from '@/src/capital/components/forms/FormField';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import {
  INVESTMENT_COST_TYPES,
  SELECTABLE_ACTIVITY_TYPES,
  VEHICLE_ACTIVITY_TYPE_META,
  computeRepairSettlement,
  type VehicleActivityType,
} from '@/src/capital/lib/activityTypes';
import { formatInrPlain } from '@/src/capital/lib/money';
import { lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';

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

const DEFAULT_COST_TYPE =
  INVESTMENT_COST_TYPES.find((t) => VEHICLE_ACTIVITY_TYPE_META[t].selectable) ?? 'broker_commission';

const OTHER_SELECTABLE = SELECTABLE_ACTIVITY_TYPES.filter(
  (t) => VEHICLE_ACTIVITY_TYPE_META[t].category !== 'investment_cost',
);

export function CreateActivityForm({
  assetId,
  openAdvances = [],
}: {
  assetId: string;
  openAdvances?: OpenAdvance[];
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [suggestedStatus, setSuggestedStatus] = useState<string | null>(null);
  const { showToast } = useCapitalToast();
  const refreshCapitalView = useRefreshCapitalView();

  const form = useForm<FormValues>({
    defaultValues: {
      activityType: DEFAULT_COST_TYPE,
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
  const amountWatch = useWatch({ control: form.control, name: 'amount' });
  const actualCost = useWatch({ control: form.control, name: 'actualCost' });
  const returnedAmount = useWatch({ control: form.control, name: 'returnedAmount' });
  const meta = VEHICLE_ACTIVITY_TYPE_META[activityType];
  const isSettlement = activityType === 'repair_settlement';
  const requiresAmount = meta.requiresAmount && !isSettlement;

  const repairAdvanceId = useWatch({ control: form.control, name: 'repairAdvanceId' });
  const selectedAdvance = useMemo(
    () => openAdvances.find((a) => a.id === repairAdvanceId),
    [openAdvances, repairAdvanceId],
  );

  const settlementPreview = useMemo(() => {
    if (!isSettlement || !selectedAdvance) return null;
    const actual =
      actualCost === '' || actualCost == null ? 0 : Number(actualCost);
    const returned =
      returnedAmount === '' || returnedAmount == null ? 0 : Number(returnedAmount);
    if (!Number.isFinite(actual) || !Number.isFinite(returned)) return null;
    try {
      return computeRepairSettlement({
        advancePaise: selectedAdvance.advancePaise,
        actualCostPaise: Math.round(actual * 100),
        returnedPaise: Math.round(returned * 100),
      });
    } catch {
      return null;
    }
  }, [isSettlement, selectedAdvance, actualCost, returnedAmount]);

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
        setSuggestedStatus(result.suggestedStatus ?? null);
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
        refreshCapitalView();
      }
    });
  });

  function applySuggestedStatus() {
    if (!suggestedStatus) return;
    const fd = new FormData();
    fd.set('assetId', assetId);
    fd.set('status', suggestedStatus);
    startTransition(async () => {
      const result = await updateStatusAction({}, fd);
      if (result.error) showToast(result.error);
      else {
        showToast(`Lifecycle → ${lifecycleLabel(suggestedStatus)}`);
        setSuggestedStatus(null);
        refreshCapitalView();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-ac-text-muted">
        Record costs outside Purchase Price (broker, transport, repairs, insurance, RTO, etc.).
        These change Total Vehicle Investment. Use a <strong>negative</strong> amount for a repair
        / vendor refund (reduces TVI — never profit). Token and seller payments belong on Overview →
        Purchase Payment.
      </p>

      {state.error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <FormField label="Activity type" name="activityType" form={form}>
        <select id="activityType" className="ac-input w-full" {...form.register('activityType')}>
          <optgroup label="Purchase Costs (add to investment)">
            {INVESTMENT_COST_TYPES.filter((t) => VEHICLE_ACTIVITY_TYPE_META[t].selectable).map(
              (t) => (
                <option key={t} value={t}>
                  {VEHICLE_ACTIVITY_TYPE_META[t].label}
                </option>
              ),
            )}
          </optgroup>
          <optgroup label="Other">
            {OTHER_SELECTABLE.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_ACTIVITY_TYPE_META[t].label}
                {VEHICLE_ACTIVITY_TYPE_META[t].costImpact === 'cash_only' ? ' · cash' : ''}
              </option>
            ))}
          </optgroup>
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
              Advance given: ₹{formatInrPlain(selectedAdvance.advancePaise)}. Actual repair cost
              adds to Total Vehicle Investment. Refund received only reduces investment — never
              counted as profit.
            </p>
          ) : null}
          <FormField label="Actual repair cost (₹)" name="actualCost" form={form}>
            <CurrencyInput
              id="actualCost"
              allowNegative={false}
              value={actualCost === '' || actualCost == null ? '' : Number(actualCost)}
              onValueChange={(v) =>
                form.setValue('actualCost', v == null ? '' : v, { shouldValidate: true })
              }
              required
            />
          </FormField>
          <FormField label="Refund received (₹)" name="returnedAmount" form={form}>
            <CurrencyInput
              id="returnedAmount"
              allowNegative={false}
              value={
                returnedAmount === '' || returnedAmount == null ? '' : Number(returnedAmount)
              }
              onValueChange={(v) =>
                form.setValue('returnedAmount', v == null ? '' : v, { shouldValidate: true })
              }
            />
            <p className="mt-1 text-xs text-ac-text-muted">
              Unused advance cash returned to you — not profit and does not reduce TVI by itself. To
              reduce Total Vehicle Investment for a vendor refund, add a separate cost activity with
              a negative amount.
            </p>
          </FormField>
          {settlementPreview && settlementPreview.additionalAmountRequiredPaise > 0 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Additional amount required: ₹
              {formatInrPlain(settlementPreview.additionalAmountRequiredPaise)}
              <span className="mt-0.5 block text-xs text-amber-200/80">
                Actual cost exceeds the advance. Full actual cost still counts toward investment.
              </span>
            </p>
          ) : null}
          {settlementPreview && settlementPreview.cashStillHeldPaise > 0 ? (
            <p className="text-xs text-ac-text-muted">
              Cash still held after settlement: ₹
              {formatInrPlain(settlementPreview.cashStillHeldPaise)}
            </p>
          ) : null}
        </>
      ) : requiresAmount ? (
        <FormField label="Amount (₹)" name="amount" form={form}>
          <CurrencyInput
            id="amount"
            allowNegative
            value={amountWatch === '' || amountWatch == null ? '' : Number(amountWatch)}
            onValueChange={(v) =>
              form.setValue('amount', v == null ? '' : v, { shouldValidate: true })
            }
            required
          />
          <p className="mt-1 text-xs text-ac-text-muted">
            Use Indian format (e.g. 10,000). Negative = refund reducing Total Vehicle Investment.
          </p>
        </FormField>
      ) : null}

      <FormField label="Title (optional)" name="title" form={form}>
        <Input id="title" {...form.register('title')} placeholder={meta.label} />
      </FormField>

      <FormField label="Notes" name="notes" form={form}>
        <Textarea id="notes" rows={2} {...form.register('notes')} />
      </FormField>

      {suggestedStatus ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ac-accent/30 bg-ac-accent/10 px-3 py-2 text-sm">
          <span>
            Suggest lifecycle → <strong>{lifecycleLabel(suggestedStatus)}</strong>?
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={applySuggestedStatus} disabled={pending}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSuggestedStatus(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={pending || (isSettlement && openAdvances.length === 0)}>
        {pending ? 'Saving…' : 'Add activity'}
      </Button>
    </form>
  );
}
