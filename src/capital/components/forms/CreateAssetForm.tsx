'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createAssetAction, type ActionState } from '@/src/capital/actions/assets';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { createAssetSchema, type CreateAssetInput } from '@/src/capital/lib/validation/schemas';

const DRAFT_KEY = 'asset-new';

const MANUFACTURERS = [
  'Maruti Suzuki',
  'Hyundai',
  'Tata',
  'Mahindra',
  'Honda',
  'Toyota',
  'Kia',
  'MG',
  'Skoda',
  'Volkswagen',
  'Renault',
  'Nissan',
  'Ford',
  'Fiat',
  'Jeep',
  'Force',
  'Isuzu',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Other',
] as const;

const FUEL_TYPES: { value: CreateAssetInput['fuelType']; label: string }[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'cng', label: 'CNG' },
  { value: 'ev', label: 'EV' },
  { value: 'hybrid', label: 'Hybrid' },
];

const OWNERSHIP: { value: CreateAssetInput['ownership']; label: string }[] = [
  { value: 'first_owner', label: 'First Owner' },
  { value: 'second_owner', label: 'Second Owner' },
  { value: 'third_owner', label: 'Third Owner' },
];

const selectClass =
  'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac-accent/40';

function yearOptions() {
  const max = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = max; y >= 1990; y -= 1) years.push(y);
  return years;
}

export function CreateAssetForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [brandQuery, setBrandQuery] = useState('');
  const [brandOpen, setBrandOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<CreateAssetInput>({
    resolver: capitalZodResolver(createAssetSchema),
    defaultValues: {
      manufacturer: '',
      model: '',
      fuelType: 'petrol',
      year: new Date().getFullYear(),
      ownership: 'first_owner',
      purchaseDate: today,
      purchasePrice: undefined as unknown as number,
    },
  });

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload) {
        const next = { ...form.getValues(), ...payload } as CreateAssetInput;
        form.reset(next);
        if (next.manufacturer) setBrandQuery(next.manufacturer);
      }
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control);

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return [...MANUFACTURERS];
    return MANUFACTURERS.filter((b) => b.toLowerCase().includes(q));
  }, [brandQuery]);

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
          <FormField label="Manufacturer (Brand) *" name="manufacturer" form={form} className="md:col-span-2">
            <div className="relative">
              <Input
                id="manufacturer"
                autoComplete="off"
                placeholder="Search brand…"
                value={brandQuery}
                onChange={(e) => {
                  setBrandQuery(e.target.value);
                  setBrandOpen(true);
                  form.setValue('manufacturer', e.target.value, { shouldValidate: true });
                }}
                onFocus={() => setBrandOpen(true)}
                onBlur={() => {
                  // delay so option click registers
                  window.setTimeout(() => setBrandOpen(false), 150);
                }}
              />
              {brandOpen && filteredBrands.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-white/10 bg-[#121218] py-1 shadow-xl">
                  {filteredBrands.map((brand) => (
                    <li key={brand}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-ac-text hover:bg-white/10"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setBrandQuery(brand);
                          form.setValue('manufacturer', brand, { shouldValidate: true });
                          setBrandOpen(false);
                        }}
                      >
                        {brand}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </FormField>

          <FormField label="Model *" name="model" form={form}>
            <Input id="model" placeholder="e.g. Swift, City, Nexon" {...form.register('model')} />
          </FormField>

          <FormField label="Fuel Type *" name="fuelType" form={form}>
            <select id="fuelType" className={selectClass} {...form.register('fuelType')}>
              {FUEL_TYPES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Year *" name="year" form={form}>
            <select
              id="year"
              className={selectClass}
              {...form.register('year', { valueAsNumber: true })}
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Ownership *" name="ownership" form={form}>
            <select id="ownership" className={selectClass} {...form.register('ownership')}>
              {OWNERSHIP.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Purchase Date *" name="purchaseDate" form={form}>
            <Input id="purchaseDate" type="date" {...form.register('purchaseDate')} />
          </FormField>

          <FormField label="Purchase Price (₹) *" name="purchasePrice" form={form}>
            <Input
              id="purchasePrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...form.register('purchasePrice', { valueAsNumber: true })}
            />
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
