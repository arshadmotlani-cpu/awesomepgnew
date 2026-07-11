'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createAssetAction, type ActionState } from '@/src/capital/actions/assets';
import { loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { createAssetSchema, type CreateAssetInput } from '@/src/capital/lib/validation/schemas';
import { formatInrPlain } from '@/src/capital/lib/money';

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
      meInvested: undefined as unknown as number,
      investor2Invested: 0,
      investor3Invested: 0,
      investor2Label: 'Investor 2',
      investor3Label: 'Investor 3',
    },
  });

  const purchasePrice = useWatch({ control: form.control, name: 'purchasePrice' });
  const meInvested = useWatch({ control: form.control, name: 'meInvested' });
  const investor2Invested = useWatch({ control: form.control, name: 'investor2Invested' });
  const investor3Invested = useWatch({ control: form.control, name: 'investor3Invested' });

  // Keep Me defaulted to full purchase when user hasn't customized funding yet
  useEffect(() => {
    if (purchasePrice == null || !Number.isFinite(purchasePrice)) return;
    const me = meInvested ?? 0;
    const i2 = investor2Invested ?? 0;
    const i3 = investor3Invested ?? 0;
    if (me === 0 && i2 === 0 && i3 === 0) {
      form.setValue('meInvested', purchasePrice, { shouldValidate: true });
    }
  }, [purchasePrice, meInvested, investor2Invested, investor3Invested, form]);

  const fundingTotal = (meInvested ?? 0) + (investor2Invested ?? 0) + (investor3Invested ?? 0);
  const fundingOk =
    purchasePrice != null &&
    Number.isFinite(purchasePrice) &&
    Math.round(fundingTotal * 100) === Math.round(purchasePrice * 100);

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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vehicle details</CardTitle>
        </CardHeader>
        <CardContent>
          <form id="create-asset-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <FormField label="Manufacturer" name="manufacturer" form={form}>
              <div className="relative">
                <Input
                  autoComplete="off"
                  value={brandQuery}
                  onChange={(e) => {
                    setBrandQuery(e.target.value);
                    setBrandOpen(true);
                    form.setValue('manufacturer', e.target.value, { shouldValidate: true });
                  }}
                  onFocus={() => setBrandOpen(true)}
                  placeholder="Search brand"
                />
                {brandOpen && filteredBrands.length > 0 ? (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-white/10 bg-ac-surface py-1 shadow-xl">
                    {filteredBrands.map((b) => (
                      <li key={b}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-white/10"
                          onClick={() => {
                            setBrandQuery(b);
                            form.setValue('manufacturer', b, { shouldValidate: true });
                            setBrandOpen(false);
                          }}
                        >
                          {b}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </FormField>

            <FormField label="Model" name="model" form={form}>
              <Input {...form.register('model')} />
            </FormField>

            <FormField label="Fuel Type" name="fuelType" form={form}>
              <select className={selectClass} {...form.register('fuelType')}>
                {FUEL_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Year" name="year" form={form}>
              <select className={selectClass} {...form.register('year', { valueAsNumber: true })}>
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Ownership" name="ownership" form={form}>
              <select className={selectClass} {...form.register('ownership')}>
                {OWNERSHIP.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Purchase Date" name="purchaseDate" form={form}>
              <Input type="date" {...form.register('purchaseDate')} />
            </FormField>

            <FormField label="Purchase Price (₹)" name="purchasePrice" form={form}>
              <Input
                type="number"
                step="0.01"
                {...form.register('purchasePrice', { valueAsNumber: true })}
              />
            </FormField>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investment structure</CardTitle>
          <p className="text-sm text-ac-text-secondary">
            Who funded this vehicle. Amounts must add up to the purchase price.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <FormField label="Me — invested (₹)" name="meInvested" form={form}>
            <Input
              type="number"
              step="0.01"
              form="create-asset-form"
              {...form.register('meInvested', { valueAsNumber: true })}
            />
          </FormField>
          <div className="space-y-2">
            <FormField label="Investor 2 — name" name="investor2Label" form={form}>
              <Input form="create-asset-form" {...form.register('investor2Label')} />
            </FormField>
            <FormField label="Investor 2 — invested (₹)" name="investor2Invested" form={form}>
              <Input
                type="number"
                step="0.01"
                form="create-asset-form"
                {...form.register('investor2Invested', { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <div className="space-y-2">
            <FormField label="Investor 3 — name" name="investor3Label" form={form}>
              <Input form="create-asset-form" {...form.register('investor3Label')} />
            </FormField>
            <FormField label="Investor 3 — invested (₹)" name="investor3Invested" form={form}>
              <Input
                type="number"
                step="0.01"
                form="create-asset-form"
                {...form.register('investor3Invested', { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <div className="md:col-span-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ac-text-secondary">Funding total</span>
              <span className={fundingOk ? 'text-ac-success' : 'text-ac-danger'}>
                ₹{formatInrPlain(Math.round(fundingTotal * 100))}
                {purchasePrice != null
                  ? ` / ₹${formatInrPlain(Math.round(purchasePrice * 100))}`
                  : ''}
                {fundingOk ? ' · balanced' : ' · must match purchase price'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      <Button type="submit" form="create-asset-form" disabled={pending || !fundingOk}>
        {pending ? 'Creating…' : 'Create asset'}
      </Button>
    </div>
  );
}
