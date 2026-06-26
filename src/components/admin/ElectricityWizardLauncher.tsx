'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { RoomMissingElectricityRow } from '@/src/services/electricityBilling';

export function ElectricityWizardLauncher({
  missingRooms,
  billingMonth,
  defaultPgId,
}: {
  missingRooms: RoomMissingElectricityRow[];
  billingMonth: string;
  defaultPgId?: string;
}) {
  const router = useRouter();
  const month = billingMonth.slice(0, 7);

  const pgOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of missingRooms) map.set(r.pgId, r.pgName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [missingRooms]);

  const [pgId, setPgId] = useState(defaultPgId ?? (pgOptions.length === 1 ? pgOptions[0][0] : ''));

  function start() {
    if (!pgId) return;
    const first = missingRooms.find((r) => r.pgId === pgId);
    if (!first) return;
    router.push(
      `/admin/billing/electricity/generate?month=${month}&wizard=1&pgId=${pgId}&roomId=${first.roomId}`,
    );
  }

  if (missingRooms.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        All eligible AC rooms have electricity bills for {month}.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Start electricity entry</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Pick a PG once — then enter only the current meter reading room by room.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">PG</span>
          <select
            value={pgId}
            onChange={(e) => setPgId(e.target.value)}
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
          >
            <option value="">— pick a PG —</option>
            {pgOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name} (
                {missingRooms.filter((r) => r.pgId === id).length} room
                {missingRooms.filter((r) => r.pgId === id).length === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!pgId}
          onClick={start}
          className="rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          Start electricity entry →
        </button>
      </div>
    </section>
  );
}
