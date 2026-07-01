'use client';

import { useActionState, useState } from 'react';
import {
  updateProfileAction,
  type ProfileActionState,
} from '@/app/(customer)/account/profile/actions';
import { IndianPhoneInput } from '@/src/components/customer/IndianPhoneInput';
import { primaryBtn } from '@/src/lib/design-system/tokens';

const INITIAL: ProfileActionState = { status: 'idle' };

type Props = {
  defaultValues: {
    fullName: string;
    email: string;
    phone: string;
  };
  next?: string;
  variant?: 'light' | 'dark';
};

export function ProfileForm({ defaultValues, next, variant = 'light' }: Props) {
  const [state, formAction, pending] = useActionState(updateProfileAction, INITIAL);
  const [phone, setPhone] = useState(defaultValues.phone);
  const dark = variant === 'dark';

  const formClass = dark
    ? 'space-y-4'
    : 'apg-account-surface mt-6 space-y-4 rounded-xl border border-zinc-200 p-5 shadow-sm';

  return (
    <form action={formAction} className={formClass}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field
        label="Full name"
        name="fullName"
        required
        defaultValue={defaultValues.fullName}
        dark={dark}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        defaultValue={defaultValues.email}
        dark={dark}
      />
      <label className={`block text-xs font-medium ${dark ? 'text-apg-silver' : 'text-zinc-700'}`}>
        Mobile number
        <IndianPhoneInput
          name="phone"
          value={phone}
          onChange={setPhone}
          required
          className="mt-1"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={dark ? `${primaryBtn} w-full` : 'w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300'}
      >
        {pending ? 'Saving…' : 'Save profile'}
      </button>

      {state.status === 'error' ? (
        <p className={`text-sm ${dark ? 'text-rose-300' : 'text-rose-700'}`}>{state.message}</p>
      ) : null}
      {state.status === 'ok' ? (
        <p className={`text-sm ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>{state.message}</p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  dark,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  dark?: boolean;
}) {
  return (
    <label className={`block text-xs font-medium ${dark ? 'text-apg-silver' : 'text-zinc-700'}`}>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={
          dark
            ? 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-apg-silver/60 focus:border-apg-orange/50 focus:outline-none focus:ring-1 focus:ring-apg-orange/30'
            : 'mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
        }
      />
    </label>
  );
}
