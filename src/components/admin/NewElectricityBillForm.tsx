'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  createElectricityBillAction,
  type ActionState,
} from '@/app/(admin)/admin/electricity/new/actions';
import type { RoomPickerRow } from '@/src/db/queries/admin';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { paiseToInr } from '@/src/lib/format';

const idle: ActionState = { status: 'idle' };

export function NewElectricityBillForm({
  rooms,
  defaultMonth,
}: {
  rooms: RoomPickerRow[];
  defaultMonth: string;
}) {
  const [state, action, pending] = useActionState(createElectricityBillAction, idle);
  const [prevReading, setPrevReading] = useState<string>('');
  const [currReading, setCurrReading] = useState<string>('');
  const [rateInr, setRateInr] = useState<string>(
    String(DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE / 100),
  );
  const [roomId, setRoomId] = useState<string>('');
  const [loadingPrev, setLoadingPrev] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    setLoadingPrev(true);
    void fetch(`/api/admin/rooms/${roomId}/last-electricity-reading`, { cache: 'no-store' })
      .then((res) => res.json())
      .then(
        (json: {
          ok?: boolean;
          data?: { previousReadingUnits: number; ratePerUnitPaise: number };
        }) => {
          if (json.ok && json.data) {
            setPrevReading(String(json.data.previousReadingUnits));
            setRateInr(String(json.data.ratePerUnitPaise / 100));
          }
        },
      )
      .catch(() => undefined)
      .finally(() => setLoadingPrev(false));
  }, [roomId]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.roomId === roomId),
    [rooms, roomId],
  );

  const previewUnits = useMemo(() => {
    const p = Number(prevReading);
    const c = Number(currReading);
    if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
    if (c < p) return null;
    return Math.round((c - p) * 100) / 100;
  }, [prevReading, currReading]);

  const previewTotalPaise = useMemo(() => {
    if (previewUnits == null) return null;
    const r = Number(rateInr);
    if (!Number.isFinite(r)) return null;
    return Math.round(previewUnits * r * 100);
  }, [previewUnits, rateInr]);

  const readingsInverted = useMemo(() => {
    const p = Number(prevReading);
    const c = Number(currReading);
    return (
      prevReading !== '' &&
      currReading !== '' &&
      Number.isFinite(p) &&
      Number.isFinite(c) &&
      c < p
    );
  }, [prevReading, currReading]);

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-5"
    >
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Room
        </span>
        <select
          name="roomId"
          required
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        >
          <option value="">— pick a room —</option>
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.pgName} · Room {r.roomNumber} ({r.bedCount} bed{r.bedCount === 1 ? '' : 's'})
              {r.prepaidCreditPaise > 0 ? ` · ${paiseToInr(r.prepaidCreditPaise)} prepaid` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Billing month (YYYY-MM-01)
        </span>
        <input
          type="text"
          name="billingMonth"
          required
          defaultValue={defaultMonth}
          pattern="\d{4}-\d{2}-\d{2}"
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
            Previous reading (units)
          </span>
          <input
            type="number"
            name="previousReadingUnits"
            min="0"
            step="0.01"
            required
            value={prevReading}
            onChange={(e) => setPrevReading(e.target.value)}
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
          />
          {loadingPrev ? (
            <p className="mt-1 text-[11px] text-apg-silver">Loading last reading…</p>
          ) : roomId ? (
            <p className="mt-1 text-[11px] text-apg-silver">
              Auto-filled from last bill or meter log for this room.
            </p>
          ) : null}
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
            Current reading (units)
          </span>
          <input
            type="number"
            name="currentReadingUnits"
            min="0"
            step="0.01"
            required
            value={currReading}
            onChange={(e) => setCurrReading(e.target.value)}
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Rate per unit (₹) — default ₹16
        </span>
        <input
          type="number"
          name="ratePerUnitInr"
          min="0"
          step="0.01"
          required
          value={rateInr}
          onChange={(e) => setRateInr(e.target.value)}
          className="apg-admin-field mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>

      {readingsInverted ? (
        <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Current reading must be ≥ previous reading.
        </p>
      ) : previewUnits != null && previewTotalPaise != null ? (
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-apg-silver">
          <div>
            Units consumed: <strong className="text-white">{previewUnits.toFixed(2)}</strong>
          </div>
          <div>
            Bill total: <strong className="text-white">{paiseToInr(previewTotalPaise)}</strong>
            {selectedRoom && selectedRoom.prepaidCreditPaise > 0 ? (
              <>
                {' '}
                − prepaid{' '}
                <strong className="text-white">
                  {paiseToInr(Math.min(selectedRoom.prepaidCreditPaise, previewTotalPaise))}
                </strong>{' '}
                = split{' '}
                <strong className="text-white">
                  {paiseToInr(Math.max(0, previewTotalPaise - selectedRoom.prepaidCreditPaise))}
                </strong>
              </>
            ) : null}{' '}
            — split across monthly residents in this room.
          </div>
        </div>
      ) : null}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pending ? 'Creating bill…' : 'Generate electricity bills for room'}
      </button>

      {state.status === 'error' ? (
        <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {state.message}
        </p>
      ) : state.status === 'duplicate' ? (
        <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          A bill for this room + month already exists.
        </p>
      ) : null}
    </form>
  );
}
