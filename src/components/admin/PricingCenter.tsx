'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  applyPgPricingAdjustmentAction,
  applyRoomPricingAdjustmentAction,
  type PricingAdjustmentActionResult,
} from '@/app/(admin)/admin/pricing/actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgPricingAdjustmentSummary, PgPricingRateTier } from '@/src/services/pgInventory';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

export type PricingCenterPg = { id: string; name: string; slug: string };
export type PricingCenterRoom = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  beds: PgInventoryBedRow[];
};

type AdjustmentMode = 'percent' | 'fixed';

const TIER_PRESETS: Array<{ id: string; tiers: PgPricingRateTier[]; label: string }> = [
  { id: 'daily', tiers: ['daily'], label: 'Daily only' },
  { id: 'weekly', tiers: ['weekly'], label: 'Weekly only' },
  { id: 'monthly', tiers: ['monthly'], label: 'Monthly only' },
  { id: 'daily_weekly', tiers: ['daily', 'weekly'], label: 'Daily + Weekly' },
  { id: 'weekly_monthly', tiers: ['weekly', 'monthly'], label: 'Weekly + Monthly' },
  { id: 'all', tiers: ['daily', 'weekly', 'monthly'], label: 'All tiers' },
];

function adjustPaise(current: number, mode: AdjustmentMode, value: number): number {
  if (current <= 0 && mode === 'percent') return 0;
  if (mode === 'percent') return Math.max(0, Math.round(current * (1 + value / 100)));
  return Math.max(0, current + value);
}

function averageMonthly(beds: PgInventoryBedRow[]): number {
  const monthlies = beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  if (monthlies.length === 0) return 0;
  return Math.round(monthlies.reduce((sum, m) => sum + m, 0) / monthlies.length);
}

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
  const pgName = pgs.find((p) => p.id === initialPgId)?.name ?? 'PG';
  const [pgId, setPgId] = useState(initialPgId);
  const [roomId, setRoomId] = useState(() => rooms[0]?.roomId ?? '');
  const [tierPreset, setTierPreset] = useState('monthly');
  const [adjMode, setAdjMode] = useState<AdjustmentMode>('percent');
  const [adjValue, setAdjValue] = useState('1');
  const [pending, setPending] = useState<'pg' | 'room' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PgPricingAdjustmentSummary | null>(null);

  useEffect(() => {
    setPgId(initialPgId);
    setLastResult(null);
  }, [initialPgId]);

  useEffect(() => {
    setRoomId((current) => {
      if (current && rooms.some((r) => r.roomId === current)) return current;
      return rooms[0]?.roomId ?? '';
    });
  }, [rooms]);

  const allBeds = useMemo(() => rooms.flatMap((r) => r.beds), [rooms]);
  const tiers = TIER_PRESETS.find((p) => p.id === tierPreset)?.tiers ?? ['monthly'];
  const numericValue = adjMode === 'percent' ? Number(adjValue) : Math.round(Number(adjValue) * 100);

  const preview = useMemo(() => {
    if (!Number.isFinite(numericValue) || allBeds.length === 0) return null;
    const prevAvg = averageMonthly(allBeds);
    const projected = allBeds.map((bed) => {
      let monthly = bed.monthlyRatePaise;
      if (tiers.includes('monthly')) {
        monthly = adjustPaise(monthly, adjMode, numericValue);
      }
      return monthly;
    });
    const withMonthly = projected.filter((m) => m > 0);
    const nextAvg =
      withMonthly.length > 0
        ? Math.round(withMonthly.reduce((sum, m) => sum + m, 0) / withMonthly.length)
        : 0;
    return {
      rooms: rooms.length,
      beds: allBeds.length,
      prevAvg,
      nextAvg: tiers.includes('monthly') ? nextAvg : prevAvg,
    };
  }, [allBeds, rooms.length, tiers, adjMode, numericValue]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.roomId === roomId) ?? rooms[0],
    [rooms, roomId],
  );

  async function runApply(scope: 'pg' | 'room') {
    if (!Number.isFinite(numericValue)) {
      setError('Enter a valid adjustment value.');
      return;
    }
    if (scope === 'room' && !selectedRoom) {
      setError('Select a room for single-room adjustment.');
      return;
    }

    setPending(scope);
    setError(null);
    setLastResult(null);

    const payload = {
      pgId,
      tiers,
      mode: adjMode,
      value: numericValue,
    };

    const result: PricingAdjustmentActionResult =
      scope === 'pg'
        ? await applyPgPricingAdjustmentAction(payload)
        : await applyRoomPricingAdjustmentAction({
            ...payload,
            roomId: selectedRoom!.roomId,
          });

    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setLastResult(result.summary);
    router.refresh();
  }

  function onPgChange(id: string) {
    setPgId(id);
    setRoomId('');
    setError(null);
    setLastResult(null);
    router.push(`/admin/pricing?pgId=${id}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Pricing Center</h1>
        <p className="mt-1 text-sm text-zinc-500">
          PG-level pricing — one adjustment updates every bed in every room. Future bookings use the
          new rates; existing residents keep their booking pricing snapshot.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
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
          Rate tiers to adjust
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

      {preview ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <h2 className="text-sm font-semibold text-indigo-950">{pgName}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Rooms" value={String(preview.rooms)} />
            <Stat label="Beds" value={String(preview.beds)} />
            <Stat label="Avg monthly (now)" value={paiseToInr(preview.prevAvg)} />
            <Stat
              label={tiers.includes('monthly') ? 'Avg monthly (after)' : 'Avg monthly'}
              value={
                tiers.includes('monthly') && preview.nextAvg !== preview.prevAvg
                  ? paiseToInr(preview.nextAvg)
                  : '—'
              }
            />
          </dl>
          {rooms.length > 0 ? (
            <p className="mt-3 text-xs text-indigo-900/80">
              Rooms: {rooms.map((r) => r.roomNumber).join(', ')}
            </p>
          ) : null}
        </section>
      ) : null}

      <fieldset className="rounded-xl border border-zinc-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-900">PG-wide adjustment</legend>
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
              placeholder={adjMode === 'percent' ? '1' : '100'}
            />
          </label>
          <button
            type="button"
            disabled={pending !== null || allBeds.length === 0}
            onClick={() => void runApply('pg')}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending === 'pg' ? 'Applying to entire PG…' : 'Apply to entire PG'}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </fieldset>

      {lastResult ? (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <h2 className="text-sm font-semibold text-emerald-900">Pricing updated</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Successfully updated {lastResult.bedsAffected} beds across {lastResult.roomsAffected}{' '}
            room{lastResult.roomsAffected === 1 ? '' : 's'} in {lastResult.pgName}.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="PG updated" value={lastResult.pgName} />
            <Stat label="Rooms affected" value={String(lastResult.roomsAffected)} />
            <Stat label="Beds affected" value={String(lastResult.bedsAffected)} />
            <Stat
              label="Previous avg monthly"
              value={paiseToInr(lastResult.previousAvgMonthlyPaise)}
            />
            <Stat label="New avg monthly" value={paiseToInr(lastResult.newAvgMonthlyPaise)} />
          </dl>
          {lastResult.roomNumbers.length > 0 ? (
            <p className="mt-3 text-xs text-emerald-900/90">
              Rooms: {lastResult.roomNumbers.join(', ')}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-emerald-800">
            Existing residents are unchanged — only future bookings use these rates.
          </p>
        </section>
      ) : null}

      <details className="rounded-xl border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
          Single room adjustment (exceptional)
        </summary>
        <p className="mt-2 text-xs text-zinc-500">
          Use only when one room needs a different change. Normal workflow is Apply to entire PG
          above.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Room
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="h-10 min-w-[200px] rounded-lg border border-zinc-300 bg-white px-3 text-sm"
            >
              {rooms.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.floorLabel} · Room {r.roomNumber}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending !== null || !selectedRoom}
            onClick={() => void runApply('room')}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending === 'room' ? 'Applying…' : 'Apply to this room only'}
          </button>
        </div>

        {selectedRoom ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedRoom.beds.map((bed) => (
              <article
                key={bed.bedId}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
              >
                <p className="font-semibold text-zinc-900">
                  Room {selectedRoom.roomNumber} · Bed {bed.bedCode}
                </p>
                <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                  <Row label="Daily" value={paiseToInr(bed.dailyRatePaise)} />
                  <Row label="Weekly" value={paiseToInr(bed.weeklyRatePaise)} />
                  <Row label="Monthly" value={paiseToInr(bed.monthlyRatePaise)} />
                </dl>
              </article>
            ))}
          </div>
        ) : null}
      </details>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">PG inventory</h2>
        <p className="mt-1 text-xs text-zinc-500">All rooms and beds in {pgName}.</p>
        <ul className="mt-3 divide-y divide-zinc-100">
          {rooms.map((room) => (
            <li key={room.roomId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium text-zinc-900">
                {room.floorLabel} · Room {room.roomNumber}
              </span>
              <span className="text-xs text-zinc-500">
                {room.beds.length} bed{room.beds.length === 1 ? '' : 's'} · avg monthly{' '}
                {paiseToInr(averageMonthly(room.beds))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-medium text-zinc-800">{value}</dd>
    </div>
  );
}
