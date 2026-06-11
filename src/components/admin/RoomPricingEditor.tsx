'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  archiveBedAction,
  updateRoomPricingAction,
} from '@/app/(admin)/admin/pgs/inventory-actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

type RateFields = {
  dailyRate: string;
  weeklyRate: string;
  monthlyRate: string;
  dailyDeposit: string;
  weeklyDeposit: string;
  monthlyDeposit: string;
};

function paiseToField(paise: number): string {
  if (!paise) return '';
  return (paise / 100).toString();
}

function fieldsFromBed(bed: PgInventoryBedRow): RateFields {
  return {
    dailyRate: paiseToField(bed.dailyRatePaise),
    weeklyRate: paiseToField(bed.weeklyRatePaise),
    monthlyRate: paiseToField(bed.monthlyRatePaise),
    dailyDeposit: paiseToField(bed.dailyDepositPaise),
    weeklyDeposit: paiseToField(bed.weeklyDepositPaise),
    monthlyDeposit: paiseToField(bed.monthlyDepositPaise),
  };
}

function bedsHaveMixedPricing(beds: PgInventoryBedRow[]): boolean {
  if (beds.length <= 1) return false;
  const first = beds[0];
  return beds.some(
    (b) =>
      b.dailyRatePaise !== first.dailyRatePaise ||
      b.weeklyRatePaise !== first.weeklyRatePaise ||
      b.monthlyRatePaise !== first.monthlyRatePaise ||
      b.dailyDepositPaise !== first.dailyDepositPaise ||
      b.weeklyDepositPaise !== first.weeklyDepositPaise ||
      b.monthlyDepositPaise !== first.monthlyDepositPaise,
  );
}

export function RoomPricingEditor({
  pgId,
  roomId,
  beds,
}: {
  pgId: string;
  roomId: string;
  beds: PgInventoryBedRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<RateFields>(() => fieldsFromBed(beds[0]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [removingBedId, setRemovingBedId] = useState<string | null>(null);

  const mixed = bedsHaveMixedPricing(beds);

  async function onRemoveBed(bedId: string, bedCode: string) {
    const confirmed = window.confirm(
      `Remove bed ${bedCode}? Past bookings stay in records.`,
    );
    if (!confirmed) return;
    setRemovingBedId(bedId);
    setError(null);
    const result = await archiveBedAction(pgId, bedId);
    setRemovingBedId(null);
    if (!result.ok) {
      setError(result.error ?? 'Failed to remove bed');
      return;
    }
    router.refresh();
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('dailyRate', values.dailyRate);
    fd.set('weeklyRate', values.weeklyRate);
    fd.set('monthlyRate', values.monthlyRate);
    fd.set('dailyDeposit', values.dailyDeposit);
    fd.set('weeklyDeposit', values.weeklyDeposit);
    fd.set('monthlyDeposit', values.monthlyDeposit);
    const result = await updateRoomPricingAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      return;
    }
    setMessage('Room rent updated for all beds.');
    setOpen(false);
    router.refresh();
  }

  if (beds.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Beds & rent
        </p>
        <button
          type="button"
          onClick={() => {
            setValues(fieldsFromBed(beds[0]));
            setOpen((v) => !v);
            setError(null);
            setMessage(null);
          }}
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          {open ? 'Cancel' : 'Edit rent for this room'}
        </button>
      </div>

      {mixed ? (
        <p className="mb-2 text-xs text-amber-400/90">
          Beds in this room have different prices. Editing applies the same rent to all beds here.
        </p>
      ) : null}

      {error && !open ? <p className="mb-2 text-sm text-rose-400">{error}</p> : null}

      {open ? (
        <form
          onSubmit={onSave}
          className="mb-4 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-3"
        >
          <label className="text-sm">
            <span className="text-zinc-400">Daily rent (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.dailyRate}
              onChange={(e) => setValues((v) => ({ ...v, dailyRate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Weekly rent (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.weeklyRate}
              onChange={(e) => setValues((v) => ({ ...v, weeklyRate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Monthly rent (₹) *</span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={values.monthlyRate}
              onChange={(e) => setValues((v) => ({ ...v, monthlyRate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Daily deposit (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.dailyDeposit}
              onChange={(e) => setValues((v) => ({ ...v, dailyDeposit: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Weekly deposit (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.weeklyDeposit}
              onChange={(e) => setValues((v) => ({ ...v, weeklyDeposit: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Monthly deposit (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.monthlyDeposit}
              onChange={(e) => setValues((v) => ({ ...v, monthlyDeposit: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save room rent'}
            </button>
            {error ? <span className="text-sm text-rose-400">{error}</span> : null}
          </div>
        </form>
      ) : null}

      {message && !open ? (
        <p className="mb-2 text-sm text-emerald-400">{message}</p>
      ) : null}

      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="pb-2 pr-4">Bed</th>
            <th className="pb-2 pr-4">Sharing</th>
            <th className="pb-2 pr-4">Monthly</th>
            <th className="pb-2 pr-4">Weekly</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2"> </th>
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {beds.map((b) => (
            <tr key={b.bedId}>
              <td className="py-1 pr-4 font-medium text-white">{b.bedCode}</td>
              <td className="py-1 pr-4">{b.roomTypeName}</td>
              <td className="py-1 pr-4">{paiseToInr(b.monthlyRatePaise)}</td>
              <td className="py-1 pr-4">
                {b.weeklyRatePaise > 0 ? paiseToInr(b.weeklyRatePaise) : '—'}
              </td>
              <td className="py-1 pr-4 capitalize">{b.bedStatus}</td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => onRemoveBed(b.bedId, b.bedCode)}
                  disabled={removingBedId === b.bedId}
                  className="text-xs text-rose-400 hover:underline disabled:opacity-50"
                >
                  {removingBedId === b.bedId ? 'Removing…' : 'Remove'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
