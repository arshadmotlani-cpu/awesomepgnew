'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  createElectricityBillAction,
  type ActionState,
} from '@/app/(admin)/admin/electricity/new/actions';
import type { RoomPickerRow } from '@/src/db/queries/admin';
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
  const [rateInr, setRateInr] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');

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
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Room
        </span>
        <select
          name="roomId"
          required
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Billing month (YYYY-MM-01)
        </span>
        <input
          type="text"
          name="billingMonth"
          required
          defaultValue={defaultMonth}
          pattern="\d{4}-\d{2}-\d{2}"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Rate per unit (₹)
        </span>
        <input
          type="number"
          name="ratePerUnitInr"
          min="0"
          step="0.01"
          required
          value={rateInr}
          onChange={(e) => setRateInr(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      {readingsInverted ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Current reading must be ≥ previous reading.
        </p>
      ) : previewUnits != null && previewTotalPaise !== null ? (
        <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
          <div>
            Units consumed: <strong>{previewUnits.toFixed(2)}</strong>
          </div>
          <div>
            Bill total: <strong>{paiseToInr(previewTotalPaise)}</strong>
            {selectedRoom && selectedRoom.prepaidCreditPaise > 0 ? (
              <>
                {' '}
                − prepaid <strong>{paiseToInr(Math.min(selectedRoom.prepaidCreditPaise, previewTotalPaise))}</strong>{' '}
                = split{' '}
                <strong>
                  {paiseToInr(
                    Math.max(0, previewTotalPaise - selectedRoom.prepaidCreditPaise),
                  )}
                </strong>
              </>
            ) : null}{' '}
            — split across monthly residents by active days in the billing month.
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Due 3 days after creation. 1%/day penalty thereafter.
          </div>
        </div>
      ) : null}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
      >
        {pending ? 'Creating bill…' : 'Create bill + invoices'}
      </button>

      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : state.status === 'duplicate' ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A bill for this room + month already exists.
        </p>
      ) : null}
    </form>
  );
}
