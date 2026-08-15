'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateRoomPricingAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { AdminOpsDialog } from '@/src/components/admin/rooms/AdminOpsDialog';
import {
  formatRentSuccessMessage,
  type RoomRateSnapshot,
} from '@/src/components/admin/rooms/roomCardFormatters';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

type Props = {
  open: boolean;
  onClose: () => void;
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  beds: PgInventoryBedRow[];
  onSaved: (rates: RoomRateSnapshot) => void;
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomRentEditorDialog({
  open,
  onClose,
  pgId,
  roomId,
  roomNumber,
  floorLabel,
  beds,
  onSaved,
  onToast,
}: Props) {
  const router = useRouter();
  const first = beds[0];
  const [values, setValues] = useState(() => ({
    dailyRate: first ? String(first.dailyRatePaise / 100) : '',
    weeklyRate: first ? String(first.weeklyRatePaise / 100) : '',
    monthlyRate: first ? String(first.monthlyRatePaise / 100) : '',
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!first) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('dailyRate', values.dailyRate);
    fd.set('weeklyRate', values.weeklyRate);
    fd.set('monthlyRate', values.monthlyRate);
    fd.set('dailyDeposit', String(first.dailyDepositPaise / 100));
    fd.set('weeklyDeposit', String(first.weeklyDepositPaise / 100));
    fd.set('monthlyDeposit', String(first.monthlyDepositPaise / 100));
    const result = await updateRoomPricingAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      const msg = result.error ?? "Couldn't save rent. Nothing was changed.";
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    const rates: RoomRateSnapshot = {
      dailyPaise: result.rates.dailyPaise,
      weeklyPaise: result.rates.weeklyPaise,
      monthlyPaise: result.rates.monthlyPaise,
    };
    onSaved(rates);
    onToast(formatRentSuccessMessage(rates), 'success');
    onClose();
    router.refresh();
  }

  if (!first) return null;

  return (
    <AdminOpsDialog
      open={open}
      onClose={() => !pending && onClose()}
      title={`Room ${roomNumber} — Rent`}
      subtitle={floorLabel}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onSave()}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        className="space-y-4"
      >
        <p className="text-sm text-zinc-400">
          Applies to all {beds.length} bed{beds.length === 1 ? '' : 's'} in this room. Existing
          resident bookings keep their locked pricing snapshot.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { key: 'monthlyRate', label: 'Monthly (₹)', required: true },
              { key: 'weeklyRate', label: 'Weekly (₹)', required: false },
              { key: 'dailyRate', label: 'Daily (₹)', required: false },
            ] as const
          ).map(({ key, label, required }) => (
            <label key={key} className="text-sm">
              <span className="text-zinc-400">{label}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required={required}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>
    </AdminOpsDialog>
  );
}
