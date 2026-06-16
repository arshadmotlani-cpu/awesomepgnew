'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { applyPricingAdjustmentAction } from '@/app/(admin)/admin/pricing/actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

export type PricingCenterPg = { id: string; name: string; slug: string };
export type PricingCenterRoom = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  beds: PgInventoryBedRow[];
};

type RateTier = 'daily' | 'weekly' | 'monthly';
type AdjustmentMode = 'percent' | 'fixed';

const TIER_PRESETS: Array<{ id: string; tiers: RateTier[]; label: string }> = [
  { id: 'daily', tiers: ['daily'], label: 'Daily only' },
  { id: 'weekly', tiers: ['weekly'], label: 'Weekly only' },
  { id: 'monthly', tiers: ['monthly'], label: 'Monthly only' },
  { id: 'daily_weekly', tiers: ['daily', 'weekly'], label: 'Daily + Weekly' },
  { id: 'weekly_monthly', tiers: ['weekly', 'monthly'], label: 'Weekly + Monthly' },
  { id: 'all', tiers: ['daily', 'weekly', 'monthly'], label: 'All' },
];

export function PricingCenter({
  pgs,
  initialPgId,
  rooms,
}: {
  pgs: PricingCenterPg[];
  initialPgId: string;
  rooms: PricingCenterRoom[];
}) {
  const router = useRouter();
  const [pgId, setPgId] = useState(initialPgId);
  const [roomId, setRoomId] = useState(rooms[0]?.roomId ?? '');
  const [tierPreset, setTierPreset] = useState('all');
  const [adjMode, setAdjMode] = useState<AdjustmentMode>('percent');
  const [adjValue, setAdjValue] = useState('5');
  const [notifyResident, setNotifyResident] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.roomId === roomId) ?? rooms[0],
    [rooms, roomId],
  );

  async function onApply() {
    if (!selectedRoom) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const tiers = TIER_PRESETS.find((p) => p.id === tierPreset)?.tiers ?? ['monthly'];
    const result = await applyPricingAdjustmentAction({
      pgId,
      roomId: selectedRoom.roomId,
      tiers,
      mode: adjMode,
      value: adjMode === 'percent' ? Number(adjValue) : Math.round(Number(adjValue) * 100),
      notifyResident,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? 'Pricing updated.');
    router.refresh();
  }

  function onPgChange(id: string) {
    router.push(`/admin/pricing?pgId=${id}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Pricing Center</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Adjust daily, weekly, and monthly rates. Changes propagate to booking pages, resident
          dashboards, invoices, and deposit requirements immediately.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          PG
          <select
            value={pgId}
            onChange={(e) => onPgChange(e.target.value)}
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          >
            {pgs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Room
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          >
            {rooms.map((r) => (
              <option key={r.roomId} value={r.roomId}>
                {r.floorLabel} · Room {r.roomNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Rate tiers
          <select
            value={tierPreset}
            onChange={(e) => setTierPreset(e.target.value)}
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          >
            {TIER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="rounded-xl border border-zinc-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Adjustment</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={adjMode === 'percent'}
              onChange={() => setAdjMode('percent')}
            />
            Percentage (+1%, +5%, −2%)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={adjMode === 'fixed'}
              onChange={() => setAdjMode('fixed')}
            />
            Fixed amount (+₹100, −₹50)
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            {adjMode === 'percent' ? 'Percent change' : 'Amount (₹)'}
            <input
              type="number"
              step={adjMode === 'percent' ? '0.1' : '1'}
              value={adjValue}
              onChange={(e) => setAdjValue(e.target.value)}
              className="h-10 w-32 rounded-lg border border-zinc-300 px-3 text-sm"
              placeholder={adjMode === 'percent' ? '5' : '100'}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={notifyResident}
              onChange={(e) => setNotifyResident(e.target.checked)}
            />
            Automatically notify resident of deposit adjustments
          </label>
          <button
            type="button"
            disabled={pending || !selectedRoom}
            onClick={() => void onApply()}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Applying…' : 'Apply to room beds'}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </fieldset>

      {selectedRoom ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Bed map — Room {selectedRoom.roomNumber}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedRoom.beds.map((bed) => (
              <article
                key={bed.bedId}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
              >
                <p className="font-semibold text-zinc-900">Bed {bed.bedCode}</p>
                <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                  <div className="flex justify-between">
                    <dt>Daily</dt>
                    <dd>{bed.dailyRatePaise ? paiseToInr(bed.dailyRatePaise) : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Weekly</dt>
                    <dd>{bed.weeklyRatePaise ? paiseToInr(bed.weeklyRatePaise) : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Monthly</dt>
                    <dd>{bed.monthlyRatePaise ? paiseToInr(bed.monthlyRatePaise) : '—'}</dd>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 pt-1 font-medium text-zinc-800">
                    <dt>Deposit (mo)</dt>
                    <dd>
                      {bed.monthlyDepositPaise
                        ? paiseToInr(bed.monthlyDepositPaise)
                        : bed.monthlyRatePaise
                          ? paiseToInr(bed.monthlyRatePaise * 2)
                          : '—'}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
