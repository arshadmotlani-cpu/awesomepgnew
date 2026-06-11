'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  updateBedStatusAction,
  updateBookingAdminOpsAction,
} from '@/app/(admin)/admin/bookings/[bookingId]/actions';
import type {
  AdminDepositRefundStatus,
  AdminDuesStatus,
  BedInventoryStatus,
} from '@/src/lib/bookingAdminOpsLabels';
import {
  labelAdminDepositRefundStatus,
  labelAdminDuesStatus,
} from '@/src/lib/bookingAdminOpsLabels';

type BedRow = {
  bedId: string;
  bedCode: string;
  reservationStatus: string;
  bedInventoryStatus: BedInventoryStatus;
};

type Props = {
  bookingId: string;
  adminDuesStatus: AdminDuesStatus;
  adminDepositRefundStatus: AdminDepositRefundStatus;
  adminOpsNotes: string | null;
  computedDuesPaise: number;
  depositBalancePaise: number;
  beds: BedRow[];
};

export function AdminBookingOpsPanel({
  bookingId,
  adminDuesStatus,
  adminDepositRefundStatus,
  adminOpsNotes,
  computedDuesPaise,
  depositBalancePaise,
  beds,
}: Props) {
  const router = useRouter();
  const [duesStatus, setDuesStatus] = useState(adminDuesStatus);
  const [refundStatus, setRefundStatus] = useState(adminDepositRefundStatus);
  const [notes, setNotes] = useState(adminOpsNotes ?? '');
  const [pending, setPending] = useState(false);
  const [bedPending, setBedPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveOps(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await updateBookingAdminOpsAction(bookingId, {
      adminDuesStatus: duesStatus,
      adminDepositRefundStatus: refundStatus,
      adminOpsNotes: notes,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      return;
    }
    setMessage('Operations status saved.');
    router.refresh();
  }

  async function onBedStatus(bedId: string, status: BedInventoryStatus) {
    setBedPending(bedId);
    setError(null);
    const result = await updateBedStatusAction(bedId, status);
    setBedPending(null);
    if (!result.ok) {
      setError(result.error ?? 'Failed to update bed');
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Operations checklist</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Mark dues, deposit refund, and bed availability for housekeeping and checkout.
        System-computed dues: ₹{(computedDuesPaise / 100).toFixed(2)} · Deposit balance: ₹
        {(depositBalancePaise / 100).toFixed(2)}
      </p>

      <form onSubmit={saveOps} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-zinc-600">Dues status</span>
          <select
            value={duesStatus}
            onChange={(e) => setDuesStatus(e.target.value as AdminDuesStatus)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="unknown">{labelAdminDuesStatus('unknown')}</option>
            <option value="cleared">{labelAdminDuesStatus('cleared')}</option>
            <option value="has_dues">{labelAdminDuesStatus('has_dues')}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-zinc-600">Deposit refund</span>
          <select
            value={refundStatus}
            onChange={(e) => setRefundStatus(e.target.value as AdminDepositRefundStatus)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="unknown">{labelAdminDepositRefundStatus('unknown')}</option>
            <option value="pending">{labelAdminDepositRefundStatus('pending')}</option>
            <option value="refunded">{labelAdminDepositRefundStatus('refunded')}</option>
            <option value="blocked">{labelAdminDepositRefundStatus('blocked')}</option>
            <option value="not_applicable">{labelAdminDepositRefundStatus('not_applicable')}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-zinc-600">Internal notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            placeholder="Housekeeping / checkout notes"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save operations status'}
        </button>
      </form>

      {beds.length > 0 ? (
        <div className="mt-5 border-t border-indigo-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Beds</h3>
          <ul className="mt-2 space-y-2">
            {beds.map((bed) => (
              <li
                key={bed.bedId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-mono font-medium">{bed.bedCode}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    Reservation: {bed.reservationStatus} · Inventory: {bed.bedInventoryStatus}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['available', 'blocked', 'maintenance'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={bedPending === bed.bedId}
                      onClick={() => void onBedStatus(bed.bedId, status)}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        bed.bedInventoryStatus === status
                          ? 'bg-indigo-600 text-white'
                          : 'border border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-500">
            <strong>Available</strong> = open for new bookings · <strong>Blocked</strong> = occupied
            / not bookable · <strong>Maintenance</strong> = temporarily offline
          </p>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
