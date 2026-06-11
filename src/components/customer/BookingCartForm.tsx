'use client';

import { useActionState, useState } from 'react';
import {
  IndianPhoneInput,
  indianPhoneDefaultLocal,
} from '@/src/components/customer/IndianPhoneInput';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';
import type { BookingActionState } from '@/app/(customer)/booking/new/actions';
import { createBookingAction } from '@/app/(customer)/booking/new/actions';

export type CartLineItem = {
  bedId: string;
  label: string;
  lineTotalPaise: number;
  unitsLabel: string;
};

type Props = {
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended';
  lineItems: CartLineItem[];
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  notes?: string;
  /** Pre-filled from the signed-in customer session (Phase 6). */
  defaultCustomer?: {
    fullName: string;
    email: string;
    phone: string;
  };
};

const INITIAL_STATE: BookingActionState = { status: 'idle' };

export function BookingCartForm({
  bedIds,
  startDate,
  endDate,
  durationMode,
  lineItems,
  subtotalPaise,
  depositPaise,
  totalPaise,
  defaultCustomer,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    createBookingAction,
    INITIAL_STATE,
  );

  const conflictBedIds = new Set(
    state.status === 'error' ? state.conflictBedIds ?? [] : [],
  );

  const [phoneLocal, setPhoneLocal] = useState(() =>
    indianPhoneDefaultLocal(defaultCustomer?.phone),
  );
  const phoneLocked = Boolean(defaultCustomer?.phone);

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]"
    >
      {/* Hidden state — preserved across re-renders */}
      <input type="hidden" name="startDate" value={startDate} />
      {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
      <input type="hidden" name="durationMode" value={durationMode} />
      {bedIds.map((id) => (
        <input key={id} type="hidden" name="bedId" value={id} />
      ))}

      {/* Customer details */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Your details</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Details are tied to your signed-in account. You&apos;ll continue to
          payment after confirming.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="fullName"
            required
            autoComplete="name"
            defaultValue={defaultCustomer?.fullName}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Mobile number
            <IndianPhoneInput
              value={phoneLocal}
              onChange={setPhoneLocal}
              name="phone"
              required
              readOnly={phoneLocked}
            />
          </label>
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={defaultCustomer?.email}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Gender
            <select
              name="gender"
              required
              defaultValue=""
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Notes for the operator <span className="text-zinc-400">(optional)</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="e.g. arriving late evening, need help with luggage"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {state.status === 'error' ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <strong className="font-semibold">Couldn&apos;t create the booking.</strong>
            <p className="mt-1">{state.message}</p>
            {conflictBedIds.size > 0 ? (
              <p className="mt-2 text-xs text-rose-600">
                Conflicting bed IDs:{' '}
                <code className="rounded bg-rose-100 px-1">
                  {Array.from(conflictBedIds).join(', ')}
                </code>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Cart summary */}
      <aside className="self-start rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" data-roachie-focus="confirm-booking">
        <h2 className="text-base font-semibold text-zinc-900">Your stay</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row term="Check-in" value={startDate} />
          <Row
            term="Check-out"
            value={
              endDate
                ? endDate
                : `Flexible — ${VACATING_NOTICE_MIN_DAYS} days notice to leave`
            }
          />
          <Row
            term="Stay type"
            value={
              durationMode === 'open_ended'
                ? 'Living here (monthly billing)'
                : durationMode.replace('_', ' ')
            }
          />
          <Row term="Beds" value={String(bedIds.length)} />
        </dl>

        {durationMode === 'open_ended' ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            You pay the first month now. After move-in, rent is billed monthly from your resident
            dashboard. When you plan to leave, submit a vacating request at least{' '}
            {VACATING_NOTICE_MIN_DAYS} days before your last day.
          </p>
        ) : null}

        <hr className="my-4 border-zinc-200" />

        <ul className="space-y-2 text-sm">
          {lineItems.map((item) => (
            <li
              key={item.bedId}
              className="flex items-start justify-between gap-3"
            >
              <span>
                <span className="block font-medium text-zinc-900">
                  {item.label}
                </span>
                <span className="text-xs text-zinc-500">{item.unitsLabel}</span>
              </span>
              <span className="font-semibold text-zinc-900">
                {paiseToInr(item.lineTotalPaise)}
              </span>
            </li>
          ))}
        </ul>

        <hr className="my-4 border-zinc-200" />

        <dl className="space-y-1.5 text-sm">
          <Row term="Subtotal" value={paiseToInr(subtotalPaise)} />
          <Row term="Refundable deposit" value={paiseToInr(depositPaise)} />
        </dl>

        <div className="mt-3 flex items-center justify-between rounded-md bg-zinc-900 px-3 py-2 text-white">
          <span className="text-sm font-medium">Total due now</span>
          <span className="text-base font-semibold">
            {paiseToInr(totalPaise)}
          </span>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {isPending ? 'Reserving beds…' : 'Reserve & continue to payment'}
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          You&apos;ll complete secure payment on the next step.
        </p>
      </aside>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  autoComplete,
  pattern,
  defaultValue,
  readOnly,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  pattern?: string;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        pattern={pattern}
        defaultValue={defaultValue}
        readOnly={readOnly}
        className={`h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500${readOnly ? ' bg-zinc-50 text-zinc-600' : ''}`}
      />
    </label>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{term}</dt>
      <dd className="text-zinc-900">{value}</dd>
    </div>
  );
}
