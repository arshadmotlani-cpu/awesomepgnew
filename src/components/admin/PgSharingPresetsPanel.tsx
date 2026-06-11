'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveSharingPresetsAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import {
  ROOM_SHARING_OPTIONS,
  type RoomSharingCount,
} from '@/src/lib/roomSharing';
import {
  presetRupees,
  type SharingPresetMatrix,
} from '@/src/lib/pgSharingPresets';

type FieldKey =
  | 'dailyRate'
  | 'weeklyRate'
  | 'monthlyRate'
  | 'dailyDeposit'
  | 'weeklyDeposit'
  | 'monthlyDeposit';

type Values = Record<RoomSharingCount, Record<FieldKey, string>>;

function initValues(matrix: SharingPresetMatrix): Values {
  const v = {} as Values;
  for (const opt of ROOM_SHARING_OPTIONS) {
    const row = matrix[opt.count];
    v[opt.count] = {
      dailyRate: presetRupees(row?.dailyRatePaise),
      weeklyRate: presetRupees(row?.weeklyRatePaise),
      monthlyRate: presetRupees(row?.monthlyRatePaise),
      dailyDeposit: presetRupees(row?.dailyDepositPaise),
      weeklyDeposit: presetRupees(row?.weeklyDepositPaise),
      monthlyDeposit: presetRupees(row?.monthlyDepositPaise),
    };
  }
  return v;
}

export function PgSharingPresetsPanel({
  pgId,
  initialPresets,
}: {
  pgId: string;
  initialPresets: SharingPresetMatrix;
}) {
  const [values, setValues] = useState<Values>(() => initValues(initialPresets));
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setField(sharing: RoomSharingCount, field: FieldKey, value: string) {
    setValues((prev) => ({
      ...prev,
      [sharing]: { ...prev[sharing], [field]: value },
    }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    for (const opt of ROOM_SHARING_OPTIONS) {
      const row = values[opt.count];
      for (const field of Object.keys(row) as FieldKey[]) {
        fd.set(`${opt.count}_${field}`, row[field]);
      }
    }
    const result = await saveSharingPresetsAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      return;
    }
    setMessage('Rent & deposit defaults saved for this PG.');
    router.refresh();
  }

  return (
    <form
      onSubmit={onSave}
      className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
    >
      <h3 className="text-sm font-medium text-zinc-200">
        Rent & security deposit defaults by sharing type
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Starting suggestions when you add a room — each room can have its own rent. Use
        &ldquo;Edit rent for this room&rdquo; below to set room-specific prices.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="pb-2 pr-3">Sharing</th>
              <th className="pb-2 pr-3">Daily rent (₹)</th>
              <th className="pb-2 pr-3">Weekly rent (₹)</th>
              <th className="pb-2 pr-3">Monthly rent (₹)</th>
              <th className="pb-2 pr-3">Daily deposit (₹)</th>
              <th className="pb-2 pr-3">Weekly deposit (₹)</th>
              <th className="pb-2 pr-3">Monthly deposit (₹)</th>
            </tr>
          </thead>
          <tbody>
            {ROOM_SHARING_OPTIONS.map((opt) => (
              <tr key={opt.count} className="border-t border-zinc-800/80">
                <td className="py-2 pr-3 font-medium text-zinc-300">{opt.label}</td>
                {(
                  [
                    'dailyRate',
                    'weeklyRate',
                    'monthlyRate',
                    'dailyDeposit',
                    'weeklyDeposit',
                    'monthlyDeposit',
                  ] as FieldKey[]
                ).map((field) => (
                  <td key={field} className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={values[opt.count][field]}
                      onChange={(e) => setField(opt.count, field, e.target.value)}
                      className="w-full min-w-[5rem] rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save rent & deposit defaults'}
        </button>
        {message ? <span className="text-sm text-emerald-400">{message}</span> : null}
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}
