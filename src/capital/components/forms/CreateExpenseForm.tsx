'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createExpenseAction, type ActionState } from '@/src/capital/actions/expenses';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { createExpenseSchema, type CreateExpenseInput } from '@/src/capital/lib/validation/schemas';
import { paymentModeEnum } from '@/src/capital/db/schema/enums';

const DRAFT_KEY = 'expense-new';

type Category = { id: string; label: string };
type AssetOption = { id: string; label: string };

export function CreateExpenseForm({
  categories,
  assets,
  defaultAssetId,
}: {
  categories: Category[];
  assets: AssetOption[];
  defaultAssetId?: string;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<CreateExpenseInput>({
    resolver: capitalZodResolver(createExpenseSchema),
    defaultValues: {
      assetId: defaultAssetId ?? assets[0]?.id ?? '',
      categoryId: categories[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      description: '',
    },
  });

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload) form.reset({ ...form.getValues(), ...payload } as CreateExpenseInput);
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control);

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await createExpenseAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Expense created');
        form.reset({
          assetId: values.assetId,
          categoryId: values.categoryId,
          expenseDate: new Date().toISOString().slice(0, 10),
          amount: 0,
          description: '',
        });
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record expense</CardTitle>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-sm text-ac-text-muted">
            No active vehicles. Sold and settled vehicles cannot receive new expenses.
          </p>
        ) : (
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <FormField label="Asset *" name="assetId" form={form}>
            <select
              id="assetId"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('assetId')}
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Category *" name="categoryId" form={form}>
            <select
              id="categoryId"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('categoryId')}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date *" name="expenseDate" form={form}>
            <Input id="expenseDate" type="date" {...form.register('expenseDate')} />
          </FormField>
          <FormField label="Amount (₹) *" name="amount" form={form}>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...form.register('amount')}
            />
            <p className="mt-1 text-xs text-ac-text-muted">
              Use a negative amount for refunds, credits, or Expense Adjustment (reduces vehicle cost).
            </p>
          </FormField>
          <FormField label="Description *" name="description" form={form} className="md:col-span-2">
            <Input id="description" {...form.register('description')} />
          </FormField>
          <FormField label="Vendor" name="vendor" form={form}>
            <Input id="vendor" {...form.register('vendor')} />
          </FormField>
          <FormField label="Payment method" name="paymentMethod" form={form}>
            <select
              id="paymentMethod"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
              {...form.register('paymentMethod')}
            >
              <option value="">—</option>
              {paymentModeEnum.enumValues.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Notes" name="notes" form={form} className="md:col-span-2">
            <Textarea id="notes" {...form.register('notes')} />
          </FormField>
          {state.error ? <p className="text-sm text-ac-danger md:col-span-2">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success md:col-span-2">{state.success}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Add expense'}
            </Button>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
