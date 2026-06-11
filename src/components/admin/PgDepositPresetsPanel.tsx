'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveDepositPresetsAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { ROOM_SHARING_OPTIONS, type RoomSharingCount } from '@/src/lib/roomSharing';
import type { DepositPresetsPaise } from '@/src/lib/pgDepositPresets';

export function PgDepositPresetsPanel({
  pgId,
  initialPresets,
}: {
  pgId: string;
  initialPresets: DepositPresetsPaise;
}) {
  const [values, setValues] = useState<Record<RoomSharingCount, string>>(() => {
    const v = {} as Record<RoomSharingCount, string>;
    for (const opt of ROOM_SHARING_OPTIONS) {
      const paise = initialPresets[opt.count];
      v[opt.count] = paise != null ? (paise / 100).toString() : '';
    }
    return v;
  });
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    for (const opt of ROOM_SHARING_OPTIONS) {
      fd.set(`deposit_${opt.count}`, values[opt.count]);
    }
    const result = await saveDepositPresetsAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      return;
    }
    setMessage('Deposit defaults saved for this PG.');
    router.refresh();
  }

  return (
    <form
      onSubmit={onSave}
      className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
    >
      <h3 className="text-sm font-medium text-zinc-200">Security deposit per sharing type</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Set a different deposit (₹ per bed) for each room sharing type. When you add a room, the
        deposit field auto-fills for the sharing you pick.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROOM_SHARING_OPTIONS.map((opt) => (
          <label key={opt.count} className="text-sm">
            <span className="text-zinc-400">{opt.label}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="₹ per bed"
              value={values[opt.count]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [opt.count]: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save deposit defaults'}
        </button>
        {message ? <span className="text-sm text-emerald-400">{message}</span> : null}
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}
