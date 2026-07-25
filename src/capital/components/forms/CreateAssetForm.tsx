'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { capitalZodResolver } from '@/src/capital/lib/validation/parse';
import { createAssetAction, type ActionState } from '@/src/capital/actions/assets';
import { deleteDraftAction, loadDraftAction } from '@/src/capital/actions/drafts';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { FormField } from '@/src/capital/components/forms/FormField';
import { useAutosaveDraft } from '@/src/capital/hooks/useAutosaveDraft';
import { createAssetSchema, type CreateAssetInput } from '@/src/capital/lib/validation/schemas';
import { resolveCreateFunding } from '@/src/capital/lib/investors';

const DRAFT_KEY = 'vehicle-new-v2';

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

/** Coerce empty number inputs to undefined instead of NaN. */
function registerRupees(form: ReturnType<typeof useForm<CreateAssetInput>>, name: keyof CreateAssetInput) {
  return form.register(name, {
    setValueAs: (v) => {
      if (v === '' || v == null) return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    },
  });
}

const EMPTY_DEFAULTS: CreateAssetInput = {
  manufacturer: '',
  model: '',
  fuelType: undefined as unknown as CreateAssetInput['fuelType'],
  year: undefined as unknown as number,
  ownership: undefined as unknown as CreateAssetInput['ownership'],
  registrationNumber: '',
  purchasePrice: undefined as unknown as number,
  meInvested: undefined as unknown as number,
  investor2Invested: 0,
  investor2Label: 'Partner',
};

export function CreateAssetForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [brandQuery, setBrandQuery] = useState('');
  const [brandOpen, setBrandOpen] = useState(false);
  const [withPartner, setWithPartner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  const form = useForm<CreateAssetInput>({
    resolver: capitalZodResolver(createAssetSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const purchasePrice = useWatch({ control: form.control, name: 'purchasePrice' });

  useEffect(() => {
    if (!withPartner && purchasePrice != null && Number.isFinite(purchasePrice)) {
      form.setValue('meInvested', purchasePrice, { shouldValidate: false });
      form.setValue('investor2Invested', 0, { shouldValidate: false });
    }
  }, [withPartner, purchasePrice, form]);

  useEffect(() => {
    void loadDraftAction(DRAFT_KEY).then(({ payload }) => {
      if (payload && typeof payload === 'object') {
        const next = { ...EMPTY_DEFAULTS, ...payload } as CreateAssetInput & {
          withPartner?: boolean;
        };
        if (next.manufacturer || next.model || next.purchasePrice) {
          form.reset(next);
          if (next.manufacturer) setBrandQuery(next.manufacturer);
          if (next.withPartner || (next.investor2Invested ?? 0) > 0) setWithPartner(true);
        }
      }
      setDraftReady(true);
    });
  }, [form]);

  useAutosaveDraft(DRAFT_KEY, form.control, draftReady);

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return [...MANUFACTURERS];
    return MANUFACTURERS.filter((b) => b.toLowerCase().includes(q));
  }, [brandQuery]);

  function clearForm() {
    form.reset(EMPTY_DEFAULTS);
    setBrandQuery('');
    setWithPartner(false);
    setState({});
    void deleteDraftAction(DRAFT_KEY);
  }

  const onSubmit = form.handleSubmit((values) => {
    const resolved = resolveCreateFunding({
      purchasePrice: values.purchasePrice,
      withPartner,
      meInvested: values.meInvested,
      investor2Invested: values.investor2Invested,
    });
    const fd = new FormData();
    Object.entries({
      ...values,
      meInvested: resolved.meInvested,
      investor2Invested: resolved.investor2Invested,
      investor2Label: withPartner ? values.investor2Label : undefined,
    }).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.set(k, String(v));
    });
    startTransition(async () => {
      await deleteDraftAction(DRAFT_KEY);
      const result = await createAssetAction(state, fd);
      if (result?.error) setState({ error: result.error });
    });
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Vehicle</CardTitle>
            <p className="text-sm text-ac-text-secondary">
              Creates the inventory item. Record purchase activities on the next screen.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearForm}>
            Clear form
          </Button>
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
              <Input {...form.register('model')} placeholder="e.g. Harrier" />
            </FormField>

            <FormField label="Year" name="year" form={form}>
              <select className={selectClass} {...form.register('year', { valueAsNumber: true })}>
                <option value="">Select year</option>
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Fuel Type" name="fuelType" form={form}>
              <select className={selectClass} {...form.register('fuelType')}>
                <option value="">Select fuel type</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Ownership" name="ownership" form={form}>
              <select className={selectClass} {...form.register('ownership')}>
                <option value="">Select ownership</option>
                {OWNERSHIP.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Registration Number (optional)" name="registrationNumber" form={form}>
              <Input
                placeholder="Registration number"
                className="uppercase"
                {...form.register('registrationNumber')}
              />
            </FormField>

            <FormField label="Purchase Price (₹)" name="purchasePrice" form={form}>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                {...registerRupees(form, 'purchasePrice')}
              />
            </FormField>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investment</CardTitle>
          <p className="text-sm text-ac-text-secondary">
            Most vehicles are fully self-funded. Expand partner only when needed. Funding is checked
            when you save.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="My Investment (₹)" name="meInvested" form={form}>
            <Input
              type="number"
              step="0.01"
              form="create-asset-form"
              readOnly={!withPartner}
              className={!withPartner ? 'opacity-80' : undefined}
              {...registerRupees(form, 'meInvested')}
            />
          </FormField>

          <div className="rounded-lg border border-white/10 bg-white/[0.02]">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-ac-text-secondary hover:text-ac-text"
              onClick={() => {
                const next = !withPartner;
                setWithPartner(next);
                if (!next && purchasePrice != null && Number.isFinite(purchasePrice)) {
                  form.setValue('meInvested', purchasePrice, { shouldValidate: false });
                  form.setValue('investor2Invested', 0, { shouldValidate: false });
                }
              }}
            >
              <span aria-hidden>{withPartner ? '▼' : '▶'}</span>
              <span>Partner Investment (Optional)</span>
            </button>
            {withPartner ? (
              <div className="grid gap-4 border-t border-white/10 px-4 py-4 md:grid-cols-2">
                <FormField label="Partner Name" name="investor2Label" form={form}>
                  <Input form="create-asset-form" {...form.register('investor2Label')} />
                </FormField>
                <FormField label="Partner Investment (₹)" name="investor2Invested" form={form}>
                  <Input
                    type="number"
                    step="0.01"
                    form="create-asset-form"
                    {...registerRupees(form, 'investor2Invested')}
                  />
                </FormField>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {form.formState.errors.meInvested?.message ? (
        <p className="text-sm text-ac-danger">{form.formState.errors.meInvested.message}</p>
      ) : null}
      <Button type="submit" form="create-asset-form" disabled={pending}>
        {pending ? 'Creating…' : 'Create vehicle'}
      </Button>
    </div>
  );
}
