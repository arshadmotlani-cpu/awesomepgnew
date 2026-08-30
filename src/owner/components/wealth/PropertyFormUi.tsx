'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  createPropertyAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';
import { PropertyIncomeSourcesEditor } from '@/src/owner/components/wealth/PropertyIncomeSourcesEditor';
import { StableDateInput } from '@/src/components/forms/StableDateInput';

const PROPERTY_TYPES = [
  { value: 'pg', label: 'PG' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land' },
  { value: 'other', label: 'Other' },
] as const;

const APPRECIATION_METHODS = [
  { value: 'FLAT_ANNUAL', label: 'Flat annual %' },
  { value: 'CAGR', label: 'CAGR-style appreciation' },
  { value: 'MANUAL', label: 'Manual valuation only' },
] as const;

type PgOption = { id: string; name: string; city: string };

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="oo-form-field">
      <label className="oo-form-label">{label}</label>
      {children}
      {hint ? <p className="oo-form-hint">{hint}</p> : null}
    </div>
  );
}

export function PropertyFormUi({ pgOptions }: { pgOptions: PgOption[] }) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createPropertyAction,
    {},
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [incomeSourcesJson, setIncomeSourcesJson] = useState('');
  const [linkedPgId, setLinkedPgId] = useState('');

  return (
    <div className="oo-page-stack mx-auto max-w-2xl">
      <header>
        <h1 className="oo-page-title">Add property / asset</h1>
        <p className="oo-page-subtitle">
          Record purchase basis, current value, income, and ownership. Linked PG income is
          consumed from Awesome PG — not duplicated.
        </p>
      </header>

      <form action={formAction} className="oo-page-stack">
        <section className="oo-form-section">
          <h2 className="oo-form-section-title">Property information</h2>
          <div className="oo-form-grid">
            <FormField label="Property name" hint="e.g. Shantinagar — Awesome PG">
              <input name="name" required className="oo-form-input" placeholder="Property name" />
            </FormField>
            <FormField label="Property type">
              <select name="propertyType" className="oo-form-input" defaultValue="pg">
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Address">
              <input name="address" className="oo-form-input" placeholder="Street address" />
            </FormField>
            <FormField label="City">
              <input name="city" className="oo-form-input" placeholder="City" />
            </FormField>
            <FormField label="State">
              <input name="state" className="oo-form-input" placeholder="State" />
            </FormField>
            <FormField label="Country">
              <input name="country" className="oo-form-input" placeholder="India" defaultValue="India" />
            </FormField>
            <FormField label="PIN / Postal code">
              <input name="postalCode" className="oo-form-input" placeholder="PIN code" />
            </FormField>
            <FormField label="Notes">
              <textarea name="notes" rows={2} className="oo-form-input" placeholder="Optional notes" />
            </FormField>
          </div>
        </section>

        <section className="oo-form-section">
          <h2 className="oo-form-section-title">Purchase details</h2>
          <div className="oo-form-grid">
            <FormField label="Purchase date">
              <input name="purchaseDate" type="date" className="oo-form-input oo-form-input-date" />
            </FormField>
            <MoneyInput
              name="purchasePriceRupees"
              label="Purchase price (₹)"
              required
            />
            <FormField label="Ownership %" hint="Your share — default 100%">
              <input
                name="ownershipPct"
                type="number"
                step="0.01"
                defaultValue={100}
                className="oo-form-input"
              />
            </FormField>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-3 text-sm font-medium text-[#FF5A1F]"
          >
            {showAdvanced ? 'Hide acquisition costs' : 'Add acquisition costs breakdown'}
          </button>
          {showAdvanced ? (
            <div className="oo-form-grid mt-3">
              <MoneyInput name="registrationRupees" label="Registration (₹)" />
              <MoneyInput name="stampDutyRupees" label="Stamp duty (₹)" />
              <MoneyInput name="legalFeesRupees" label="Legal fees (₹)" />
              <MoneyInput name="brokerageRupees" label="Brokerage (₹)" />
              <MoneyInput name="renovationRupees" label="Renovation at acquisition (₹)" />
              <MoneyInput name="otherAcquisitionRupees" label="Other acquisition costs (₹)" />
            </div>
          ) : (
            <MoneyInput
              name="purchaseCostsRupees"
              label="Total purchase costs (₹)"
              hint="Registration, stamp duty, legal, etc."
            />
          )}
          <p className="oo-form-hint mt-2">
            Total investment = purchase price + acquisition costs. Net worth counts your ownership
            share only.
          </p>
        </section>

        <section className="oo-form-section">
          <h2 className="oo-form-section-title">Current value & appreciation</h2>
          <div className="oo-form-grid">
            <MoneyInput
              name="currentValueRupees"
              label="Current market value (₹) — optional"
              hint="Leave blank to derive estimated current value from purchase date + appreciation %. If entered, this becomes your actual recorded value."
            />
            <FormField label="Valuation date">
              <StableDateInput
                name="valuationDate"
                className="oo-form-input oo-form-input-date"
              />
            </FormField>
            <FormField label="Expected appreciation % / year">
              <input
                name="annualAppreciationPct"
                type="number"
                step="0.01"
                className="oo-form-input"
                placeholder="e.g. 8"
              />
            </FormField>
            <FormField label="Appreciation method">
              <select name="appreciationMethod" className="oo-form-input" defaultValue="FLAT_ANNUAL">
                {APPRECIATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FormField>
          </div>
        </section>

        <section className="oo-form-section">
          <h2 className="oo-form-section-title">Property income</h2>
          <div className="oo-form-grid mb-4">
            <FormField
              label="Link to Awesome PG"
              hint="When linked, PG revenue syncs automatically — add shops/offices below"
            >
              <select
                name="linkedPgId"
                className="oo-form-input"
                value={linkedPgId}
                onChange={(e) => setLinkedPgId(e.target.value)}
              >
                <option value="">No PG link</option>
                {pgOptions.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.name} — {pg.city}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <input type="hidden" name="incomeSourcesJson" value={incomeSourcesJson} />
          <PropertyIncomeSourcesEditor
            linkedPgId={linkedPgId || undefined}
            onChange={(_, json) => setIncomeSourcesJson(json)}
          />
        </section>

        <div className="oo-form-actions">
          <button type="submit" disabled={pending} className="oo-btn-primary w-full sm:w-auto">
            {pending ? 'Creating…' : 'Create property'}
          </button>
          <Link href="/assets" className="oo-btn-secondary w-full sm:w-auto">Cancel</Link>
        </div>

        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
      </form>
    </div>
  );
}
