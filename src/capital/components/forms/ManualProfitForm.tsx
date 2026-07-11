'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import {
  createManualProfitAction,
  type ManualProfitActionState,
} from '@/src/capital/actions/manualProfits';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import {
  createManualProfitSchema,
  type CreateManualProfitInput,
} from '@/src/capital/lib/validation/schemas';

const CATEGORIES: { value: CreateManualProfitInput['category']; label: string }[] = [
  { value: 'investment_return', label: 'Investment Return' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'other', label: 'Other' },
];

export function ManualProfitForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, setState] = useState<ManualProfitActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<CreateManualProfitInput>({
    resolver: capitalZodResolver(createManualProfitSchema),
    defaultValues: {
      profitDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      source: '',
      description: '',
      category: 'investment_return',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await createManualProfitAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ ok: true });
        showToast('Manual profit recorded');
        form.reset({
          profitDate: new Date().toISOString().slice(0, 10),
          amount: 0,
          source: '',
          description: '',
          category: 'investment_return',
        });
        onSuccess?.();
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date" name="profitDate" form={form}>
          <Input type="date" {...form.register('profitDate')} />
        </FormField>
        <FormField label="Amount (₹)" name="amount" form={form}>
          <Input
            type="number"
            step="0.01"
            min="0"
            {...form.register('amount', { valueAsNumber: true })}
          />
        </FormField>
      </div>
      <FormField label="Source" name="source" form={form}>
        <Input placeholder="Investor settlement, bonus, etc." {...form.register('source')} />
      </FormField>
      <FormField label="Category" name="category" form={form}>
        <select
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text"
          {...form.register('category')}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Description" name="description" form={form}>
        <Textarea rows={3} placeholder="What is this profit from?" {...form.register('description')} />
      </FormField>
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Saving…' : 'Add Manual Profit'}
      </Button>
    </form>
  );
}
