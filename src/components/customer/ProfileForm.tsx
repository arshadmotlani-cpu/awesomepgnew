'use client';

import { useActionState, useState } from 'react';
import {
  updateProfileAction,
  type ProfileActionState,
} from '@/app/(customer)/account/profile/actions';
import { IndianPhoneInput } from '@/src/components/customer/IndianPhoneInput';

const INITIAL: ProfileActionState = { status: 'idle' };

type Props = {
  defaultValues: {
    fullName: string;
    email: string;
    phone: string;
  };
  next?: string;
};

export function ProfileForm({ defaultValues, next }: Props) {
  const [state, formAction, pending] = useActionState(updateProfileAction, INITIAL);
  const [phone, setPhone] = useState(defaultValues.phone);

  return (
    <form action={formAction} className="apg-account-surface mt-6 space-y-4 rounded-xl border border-zinc-200 p-5 shadow-sm">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Full name" name="fullName" required defaultValue={defaultValues.fullName} />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        defaultValue={defaultValues.email}
      />
      <label className="block text-xs font-medium text-zinc-700">
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
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
      >
        {pending ? 'Saving…' : 'Save profile'}
      </button>

      {state.status === 'error' ? (
        <p className="text-sm text-rose-700">{state.message}</p>
      ) : null}
      {state.status === 'ok' ? (
        <p className="text-sm text-emerald-700">{state.message}</p>
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </label>
  );
}
