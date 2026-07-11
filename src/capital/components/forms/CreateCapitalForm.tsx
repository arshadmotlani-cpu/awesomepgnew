'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createCapitalAction, type ActionState } from '@/src/capital/actions/capital';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { createCapitalSchema, type CreateCapitalInput } from '@/src/capital/lib/validation/schemas';
import { paymentModeEnum } from '@/src/capital/db/schema/enums';

const DRAFT_KEY = 'capital-new';

export function CreateCapitalForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<CreateCapitalInput>({
    resolver: capitalZodResolver(createCapitalSchema),
    defaultValues: {
      investedAt: new Date().toISOString().slice(0, 10),
      amount: 0,
      paymentMode: 'bank',
    },
  });

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload) form.reset({ ...form.getValues(), ...payload } as CreateCapitalInput);
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control);

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await createCapitalAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Capital investment recorded');
        form.reset({
          investedAt: new Date().toISOString().slice(0, 10),
          amount: 0,
          paymentMode: 'bank',
        });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="ac-glass-card grid gap-3 p-4 md:grid-cols-2">
      <FormField label="Date" name="investedAt" form={form}>
        <Input id="investedAt" type="date" {...form.register('investedAt')} />
      </FormField>
      <FormField label="Amount (₹)" name="amount" form={form}>
        <Input id="amount" type="number" step="0.01" {...form.register('amount')} />
      </FormField>
      <FormField label="Mode" name="paymentMode" form={form}>
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
          {pending ? 'Saving…' : 'Add capital'}
        </Button>
      </div>
    </form>
  );
}
