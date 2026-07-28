'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  createCustomerAction,
  type CustomerActionState,
} from '@/src/hair/actions/customers';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  FYH_CUSTOMER_GENDERS,
  FYH_CUSTOMER_SOURCES,
  FYH_HAIR_TYPES,
  FYH_SKIN_TYPES,
} from '@/src/hair/db/schema';

const initialState: CustomerActionState = {};

const fieldClass =
  'flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/40 fyh-theme-light:bg-white/70';

export function CustomerCreateForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);
  const [force, setForce] = useState(false);

  return (
    <form action={formAction} className="fyh-glass space-y-5 p-5 sm:p-6">
      <input type="hidden" name="forceCreate" value={force ? '1' : '0'} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name *" name="fullName" required />
        <Field label="Phone *" name="phone" required inputMode="tel" />
        <Field label="WhatsApp" name="whatsapp" inputMode="tel" />
        <Field label="Email" name="email" type="email" />
        <Select
          label="Gender"
          name="gender"
          options={FYH_CUSTOMER_GENDERS.map((g) => ({
            value: g,
            label: g.replace(/_/g, ' '),
          }))}
        />
        <Field label="Date of birth" name="dateOfBirth" type="date" />
        <Field label="Anniversary" name="anniversary" type="date" />
        <Field label="Occupation" name="occupation" />
        <Field label="Address" name="address" className="sm:col-span-2" />
        <Field label="City" name="city" />
        <Field label="State" name="state" />
        <Field label="Pincode" name="pincode" />
        <Select
          label="Hair type"
          name="hairType"
          options={FYH_HAIR_TYPES.map((v) => ({ value: v, label: v }))}
        />
        <Select
          label="Skin type"
          name="skinType"
          options={FYH_SKIN_TYPES.map((v) => ({ value: v, label: v }))}
        />
        <Field label="Allergies" name="allergies" className="sm:col-span-2" />
        <Field label="Preferred stylist" name="preferredStylist" />
        <Field label="Referred by" name="referredBy" />
        <Select
          label="Source"
          name="source"
          options={FYH_CUSTOMER_SOURCES.map((s) => ({
            value: s,
            label: s.replace(/_/g, ' '),
          }))}
        />
        <Field label="Tags (comma-separated)" name="tags" />
        <TextArea label="Internal notes" name="notes" className="sm:col-span-2" />
        <TextArea
          label="Important alerts (billing)"
          name="importantAlerts"
          className="sm:col-span-2"
        />
      </div>

      {state.similar?.length ? (
        <div className="space-y-3 rounded-xl border border-fyh-warning/40 bg-fyh-warning/10 p-4 text-sm">
          <p className="font-medium text-fyh-warning">Possible duplicates</p>
          <ul className="space-y-2">
            {state.similar.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.fullName} · {s.phone}
                  {s.email ? ` · ${s.email}` : ''}{' '}
                  <span className="text-fyh-text-muted">({s.matchReason})</span>
                </span>
                <Link href={`/customers/${s.id}`} className="text-fyh-accent hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-fyh-text-secondary">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="accent-fyh-forest"
            />
            Create anyway (phone must still be unique)
          </label>
        </div>
      ) : null}

      {state.error && !state.similar?.length ? (
        <p className="text-sm text-fyh-danger">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || (Boolean(state.similar?.length) && !force)}>
          {pending ? 'Saving…' : force ? 'Force create customer' : 'Create customer'}
        </Button>
        <Link href="/customers">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  inputMode,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <label htmlFor={name} className="text-sm text-fyh-text-secondary">
        {label}
      </label>
      <Input id={name} name={name} type={type} required={required} inputMode={inputMode} />
    </div>
  );
}

function TextArea({
  label,
  name,
  className,
}: {
  label: string;
  name: string;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <label htmlFor={name} className="text-sm text-fyh-text-secondary">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        className="w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm text-fyh-text-secondary">
        {label}
      </label>
      <select id={name} name={name} className={fieldClass} defaultValue="">
        <option value="">Not specified</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
