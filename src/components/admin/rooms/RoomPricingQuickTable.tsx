'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateRoomPricingAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import {
  formatRentSuccessMessage,
  ratesFromBeds,
  type RoomRateSnapshot,
} from '@/src/components/admin/rooms/roomCardFormatters';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

type RoomRow = {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  beds: PgInventoryBedRow[];
};

type Props = {
  pgId: string;
  rooms: RoomRow[];
  rateOverrides: Record<string, RoomRateSnapshot>;
  onRateSaved: (roomId: string, rates: RoomRateSnapshot) => void;
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomPricingQuickTable({
  pgId,
  rooms,
  rateOverrides,
  onRateSaved,
  onToast,
}: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState({ monthly: '', weekly: '', daily: '' });
  const [pendingId, setPendingId] = useState<string | null>(null);

  function startEdit(room: RoomRow) {
    const rates = rateOverrides[room.roomId] ?? ratesFromBeds(room.beds);
    if (!rates) return;
    setEditingId(room.roomId);
    setValues({
      monthly: String(rates.monthlyPaise / 100),
      weekly: String(rates.weeklyPaise / 100),
      daily: String(rates.dailyPaise / 100),
    });
  }

  async function saveRow(room: RoomRow) {
    const first = room.beds[0];
    if (!first) return;
    setPendingId(room.roomId);
    const fd = new FormData();
    fd.set('roomId', room.roomId);
    fd.set('monthlyRate', values.monthly);
    fd.set('weeklyRate', values.weekly);
    fd.set('dailyRate', values.daily);
    fd.set('dailyDeposit', String(first.dailyDepositPaise / 100));
    fd.set('weeklyDeposit', String(first.weeklyDepositPaise / 100));
    fd.set('monthlyDeposit', String(first.monthlyDepositPaise / 100));
    const result = await updateRoomPricingAction(pgId, fd);
    setPendingId(null);
    if (!result.ok) {
      onToast(result.error ?? "Couldn't save rent. Nothing was changed.", 'error');
      return;
    }
    const rates: RoomRateSnapshot = {
      dailyPaise: result.rates.dailyPaise,
      weeklyPaise: result.rates.weeklyPaise,
      monthlyPaise: result.rates.monthlyPaise,
    };
    onRateSaved(room.roomId, rates);
    onToast(formatRentSuccessMessage(rates), 'success');
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          Edit monthly, weekly, and daily rates per room. For percentage bulk adjustments, use the
          full pricing page.
        </p>
        <Link
          href={`/admin/pgs/${pgId}/pricing`}
          className="text-sm font-medium text-[#FF5A1F] hover:underline"
        >
          Bulk pricing →
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-950/60 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Monthly</th>
              <th className="px-4 py-3">Weekly</th>
              <th className="px-4 py-3">Daily</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {rooms.map((room) => {
              const rates = rateOverrides[room.roomId] ?? ratesFromBeds(room.beds);
              const editing = editingId === room.roomId;
              const pending = pendingId === room.roomId;
              return (
                <tr key={room.roomId} className="border-t border-zinc-800/80">
                  <td className="px-4 py-2 font-medium text-white">{room.roomNumber}</td>
                  <td className="px-4 py-2">{room.roomTypeName}</td>
                  {editing ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={values.monthly}
                          onChange={(e) => setValues((v) => ({ ...v, monthly: e.target.value }))}
                          className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={values.weekly}
                          onChange={(e) => setValues((v) => ({ ...v, weekly: e.target.value }))}
                          className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={values.daily}
                          onChange={(e) => setValues((v) => ({ ...v, daily: e.target.value }))}
                          className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void saveRow(room)}
                            className="text-xs font-medium text-[#FF5A1F] hover:underline disabled:opacity-50"
                          >
                            {pending ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-xs text-zinc-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2">
                        {rates ? paiseToInr(rates.monthlyPaise) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {rates && rates.weeklyPaise > 0 ? paiseToInr(rates.weeklyPaise) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {rates && rates.dailyPaise > 0 ? paiseToInr(rates.dailyPaise) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => startEdit(room)}
                          className="text-xs font-medium text-[#FF5A1F] hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rooms.map((room) => {
          const rates = rateOverrides[room.roomId] ?? ratesFromBeds(room.beds);
          const editing = editingId === room.roomId;
          const pending = pendingId === room.roomId;
          return (
            <div
              key={room.roomId}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">
                  Room {room.roomNumber}
                  <span className="ml-2 text-xs text-zinc-500">{room.roomTypeName}</span>
                </p>
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => startEdit(room)}
                    className="text-xs font-medium text-[#FF5A1F]"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              {editing ? (
                <div className="grid gap-2">
                  <label className="text-xs text-zinc-400">
                    Monthly (₹)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.monthly}
                      onChange={(e) => setValues((v) => ({ ...v, monthly: e.target.value }))}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Weekly (₹)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.weekly}
                      onChange={(e) => setValues((v) => ({ ...v, weekly: e.target.value }))}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Daily (₹)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.daily}
                      onChange={(e) => setValues((v) => ({ ...v, daily: e.target.value }))}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void saveRow(room)}
                      className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {pending ? 'Saving…' : 'Save row'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-zinc-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  {rates
                    ? `${paiseToInr(rates.monthlyPaise)}/mo · Weekly ${
                        rates.weeklyPaise > 0 ? paiseToInr(rates.weeklyPaise) : '—'
                      } · Daily ${rates.dailyPaise > 0 ? paiseToInr(rates.dailyPaise) : '—'}`
                    : '—'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
