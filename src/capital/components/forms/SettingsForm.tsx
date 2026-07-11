'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { updateSettingsAction, type ActionState } from '@/src/capital/actions/settings';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { updateSettingsSchema } from '@/src/capital/lib/validation/schemas';
import type { z } from 'zod';

type SettingsInput = z.infer<typeof updateSettingsSchema>;

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const form = useForm<SettingsInput>({
    resolver: capitalZodResolver(updateSettingsSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.set(k, String(v)));
    startTransition(async () => {
      const result = await updateSettingsAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Settings saved');
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Business name" name="businessName" form={form}>
            <Input id="businessName" {...form.register('businessName')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Profit share numerator" name="profitShareNumerator" form={form}>
              <Input id="profitShareNumerator" type="number" {...form.register('profitShareNumerator')} />
            </FormField>
            <FormField label="Profit share denominator" name="profitShareDenominator" form={form}>
              <Input id="profitShareDenominator" type="number" {...form.register('profitShareDenominator')} />
            </FormField>
          </div>
          <FormField label="Currency code" name="currencyCode" form={form}>
            <Input id="currencyCode" maxLength={3} {...form.register('currencyCode')} />
          </FormField>
          {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
