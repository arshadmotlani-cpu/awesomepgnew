'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import {
  updateTenancyAction,
  type UpdateTenancyState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { paiseToInr } from '@/src/lib/format';

type BedOption = { bedId: string; label: string };

export function EditTenantTenancyForm({
  bookingId,
  customerId,
  currentBedId,
  currentRoomLabel,
  currentMonthlyRentPaise,
  currentDepositPaise,
  ledgerCollectedPaise,
  websiteDepositPaise,
  blocksWholeRoom,
  beds,
}: {
  bookingId: string;
  customerId: string;
  currentBedId: string;
  currentRoomLabel: string;
  currentMonthlyRentPaise: number;
  currentDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise: number;
  blocksWholeRoom: boolean;
  beds: BedOption[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateTenancyAction, {
    ok: false,
  } satisfies UpdateTenancyState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const depositMismatch =
    ledgerCollectedPaise > 0 && ledgerCollectedPaise !== currentDepositPaise;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="customerId" value={customerId} />
      <h3 className="text-sm font-semibold text-zinc-900">Edit assignment & billing</h3>
      <p className="text-sm text-zinc-600">
        Current: <strong>{currentRoomLabel}</strong> · Rent {paiseToInr(currentMonthlyRentPaise)}/mo
        · Deposit on booking {paiseToInr(currentDepositPaise)}
        {ledgerCollectedPaise > 0 ? ` · Ledger ${paiseToInr(ledgerCollectedPaise)}` : null}
      </p>
      {depositMismatch ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Booking deposit and ledger collected amount differ. Save below to reconcile both to the
          amount you enter.
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Move to bed</span>
        <select
          name="newBedId"
          defaultValue={currentBedId}
          className="apg-admin-field mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Monthly rent (₹)</span>
        <input
          type="number"
          name="monthlyRentInr"
          min="0"
          step="1"
          defaultValue={Math.round(currentMonthlyRentPaise / 100)}
          className="apg-admin-field mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Deposit collected (₹)</span>
        <input
          type="number"
          name="depositCollectedInr"
          min="0"
          step="1"
          defaultValue={Math.round(currentDepositPaise / 100)}
          className="apg-admin-field mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        {websiteDepositPaise > 0 ? (
          <span className="mt-1 block text-xs text-zinc-500">
            Website default for this bed: <strong>{paiseToInr(websiteDepositPaise)}</strong> — enter
            the amount you actually received if it differs (e.g. grandfathered tenant).
          </span>
        ) : (
          <span className="mt-1 block text-xs text-zinc-500">
            Total deposit recorded for this tenant. Saving updates the booking and deposit ledger.
          </span>
        )}
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="blocksWholeRoom" defaultChecked={blocksWholeRoom} />
        <span>Block whole room on calendar (single-tenant room)</span>
      </label>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save assignment & rent'}
      </button>
    </form>
  );
}
