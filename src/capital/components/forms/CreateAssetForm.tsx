'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createAssetAction, type ActionState } from '@/src/capital/actions/assets';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { createAssetSchema, type CreateAssetInput } from '@/src/capital/lib/validation/schemas';
import { useState, useTransition } from 'react';

const DRAFT_KEY = 'asset-new';

export function CreateAssetForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateAssetInput>({
    resolver: capitalZodResolver(createAssetSchema),
    defaultValues: {
      manufacturer: '',
      model: '',
      year: new Date().getFullYear(),
      registrationNumber: '',
      purchaseDate: new Date().toISOString().slice(0, 10),
      purchasePrice: 0,
    },
  });

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload) form.reset({ ...form.getValues(), ...payload } as CreateAssetInput);
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control);

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await createAssetAction(state, fd);
      if (result?.error) setState({ error: result.error });
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <FormField label="Manufacturer *" name="manufacturer" form={form}>
            <Input id="manufacturer" {...form.register('manufacturer')} />
          </FormField>
          <FormField label="Model *" name="model" form={form}>
            <Input id="model" {...form.register('model')} />
          </FormField>
          <FormField label="Variant" name="variant" form={form}>
            <Input id="variant" {...form.register('variant')} />
          </FormField>
          <FormField label="Year *" name="year" form={form}>
            <Input id="year" type="number" {...form.register('year')} />
          </FormField>
          <FormField label="Registration *" name="registrationNumber" form={form} className="md:col-span-2">
            <Input id="registrationNumber" {...form.register('registrationNumber')} />
          </FormField>
          <FormField label="VIN" name="vin" form={form}>
            <Input id="vin" {...form.register('vin')} />
          </FormField>
          <FormField label="Color" name="color" form={form}>
            <Input id="color" {...form.register('color')} />
          </FormField>
          <FormField label="Purchase date *" name="purchaseDate" form={form}>
            <Input id="purchaseDate" type="date" {...form.register('purchaseDate')} />
          </FormField>
          <FormField label="Purchase price (₹) *" name="purchasePrice" form={form}>
            <Input id="purchasePrice" type="number" step="0.01" {...form.register('purchasePrice')} />
          </FormField>
          <FormField label="Expected sale (₹)" name="expectedSalePrice" form={form}>
            <Input id="expectedSalePrice" type="number" step="0.01" {...form.register('expectedSalePrice')} />
          </FormField>
          <FormField label="Notes" name="notes" form={form} className="md:col-span-2">
            <Textarea id="notes" {...form.register('notes')} />
          </FormField>
          {state.error ? (
            <p className="text-sm text-ac-danger md:col-span-2" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create asset'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
