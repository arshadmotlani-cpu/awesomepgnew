'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { updateAssetDetailsAction, type ActionState } from '@/src/capital/actions/assets';
import { FormField } from '@/src/capital/components/forms/FormField';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { paiseToRupees } from '@/src/capital/lib/money';

type FormValues = {
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  registrationNumber: string;
  purchasePrice: number;
  purchaseDate: string;
  notes: string;
};

const selectClass =
  'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text';

export function EditVehicleForm({
  assetId,
  defaults,
  onDone,
}: {
  assetId: string;
  defaults: {
    manufacturer: string;
    model: string;
    year: number;
    fuelType: FormValues['fuelType'];
    ownership: FormValues['ownership'];
    registrationNumber: string;
    purchasePricePaise: number;
    purchaseDate: string;
    notes: string;
  };
  onDone?: () => void;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    defaultValues: {
      manufacturer: defaults.manufacturer,
      model: defaults.model,
      year: defaults.year,
      fuelType: defaults.fuelType,
      ownership: defaults.ownership,
      registrationNumber: defaults.registrationNumber,
      purchasePrice: paiseToRupees(defaults.purchasePricePaise),
      purchaseDate: defaults.purchaseDate,
      notes: defaults.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    fd.set('assetId', assetId);
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.set(k, String(v));
    });
    startTransition(async () => {
      const result = await updateAssetDetailsAction(state, fd);
      if (result.error) setState({ error: result.error });
      else {
        setState({ success: result.success });
        onDone?.();
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <FormField label="Manufacturer" name="manufacturer" form={form}>
        <Input {...form.register('manufacturer')} required />
      </FormField>
      <FormField label="Model" name="model" form={form}>
        <Input {...form.register('model')} required />
      </FormField>
      <FormField label="Year" name="year" form={form}>
        <Input type="number" {...form.register('year', { valueAsNumber: true })} required />
      </FormField>
      <FormField label="Fuel Type" name="fuelType" form={form}>
        <select className={selectClass} {...form.register('fuelType')}>
          <option value="petrol">Petrol</option>
          <option value="diesel">Diesel</option>
          <option value="cng">CNG</option>
          <option value="ev">EV</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </FormField>
      <FormField label="Ownership" name="ownership" form={form}>
        <select className={selectClass} {...form.register('ownership')}>
          <option value="first_owner">First Owner</option>
          <option value="second_owner">Second Owner</option>
          <option value="third_owner">Third Owner</option>
        </select>
      </FormField>
      <FormField label="Registration Number" name="registrationNumber" form={form}>
        <Input className="uppercase" {...form.register('registrationNumber')} />
      </FormField>
      <FormField label="Purchase Price (₹)" name="purchasePrice" form={form}>
        <Input type="number" step="0.01" {...form.register('purchasePrice', { valueAsNumber: true })} />
      </FormField>
      <FormField label="Purchase Date" name="purchaseDate" form={form}>
        <Input type="date" {...form.register('purchaseDate')} />
      </FormField>
      <div className="md:col-span-2">
        <FormField label="Notes" name="notes" form={form}>
          <Textarea rows={2} {...form.register('notes')} />
        </FormField>
      </div>
      {state.error ? (
        <p className="md:col-span-2 text-sm text-ac-danger">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="md:col-span-2 text-sm text-ac-success">{state.success}</p>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save vehicle'}
        </Button>
      </div>
    </form>
  );
}
