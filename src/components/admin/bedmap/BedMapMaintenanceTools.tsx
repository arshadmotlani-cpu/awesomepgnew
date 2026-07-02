'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  completeBedMaintenanceAction,
  putBedUnderMaintenanceAction,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { BED_MAINTENANCE_REASONS } from '@/src/lib/bedMaintenance';
import { todayString } from '@/src/lib/dates';
import { formatDate } from '@/src/lib/format';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

export function BedMapMaintenanceTools({
  pgId,
  bed,
}: {
  pgId: string;
  bed: PgBedMapBed;
}) {
  const router = useRouter();
  const underMaintenance = bed.bedStatus === 'maintenance';
  const [reason, setReason] = useState(bed.maintenanceReason ?? 'plumbing');
  const [reasonCustom, setReasonCustom] = useState(bed.maintenanceReasonCustom ?? '');
  const [startDate, setStartDate] = useState(bed.maintenanceStartedAt ?? todayString());
  const [expectedCompletion, setExpectedCompletion] = useState(
    bed.maintenanceExpectedCompletion ?? '',
  );
  const [notes, setNotes] = useState(bed.maintenanceNotes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPut, setConfirmPut] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  async function putUnderMaintenance() {
    setPending(true);
    setError(null);
    try {
      const result = await putBedUnderMaintenanceAction(pgId, bed.bedId, {
        reason,
        reasonCustom: reason === 'other' ? reasonCustom : null,
        startDate,
        expectedCompletion: expectedCompletion.trim() || null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not update bed.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirmPut(false);
    }
  }

  async function completeMaintenance() {
    setPending(true);
    setError(null);
    try {
      const result = await completeBedMaintenanceAction(pgId, bed.bedId);
      if (!result.ok) {
        setError(result.error ?? 'Could not complete maintenance.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirmComplete(false);
    }
  }

  return (
    <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>
          🔧
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Maintenance</p>
      </div>

      {underMaintenance ? (
        <div className="mt-2 space-y-1 text-sm text-rose-50">
          <p>
            <span className="text-rose-200/80">Reason:</span>{' '}
            {bed.availability.sublabel?.split(' · ')[0] ?? 'Maintenance'}
          </p>
          {bed.maintenanceStartedAt ? (
            <p>
              <span className="text-rose-200/80">Since:</span> {formatDate(bed.maintenanceStartedAt)}
            </p>
          ) : null}
          {bed.maintenanceExpectedCompletion ? (
            <p>
              <span className="text-rose-200/80">Expected completion:</span>{' '}
              {formatDate(bed.maintenanceExpectedCompletion)}
            </p>
          ) : null}
          {bed.maintenanceNotes ? (
            <p className="text-xs text-rose-100/90">{bed.maintenanceNotes}</p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmComplete(true)}
            className="mt-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Complete maintenance
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-xs text-apg-silver">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            >
              {BED_MAINTENANCE_REASONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {reason === 'other' ? (
            <label className="block text-xs text-apg-silver">
              Custom reason
              <input
                value={reasonCustom}
                onChange={(e) => setReasonCustom(e.target.value)}
                placeholder="Describe the issue"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}

          <label className="block text-xs text-apg-silver">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-xs text-apg-silver">
            Expected completion (optional)
            <input
              type="date"
              value={expectedCompletion}
              onChange={(e) => setExpectedCompletion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-xs text-apg-silver">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            type="button"
            disabled={pending || Boolean(bed.occupant || bed.reserved)}
            onClick={() => setConfirmPut(true)}
            className="w-full rounded-lg border border-rose-400/50 bg-rose-500/20 px-3 py-2.5 text-sm font-semibold text-rose-50 hover:bg-rose-500/30 disabled:opacity-50"
          >
            Put under maintenance
          </button>
          {bed.occupant || bed.reserved ? (
            <p className="text-[11px] text-rose-200/80">
              Complete move-out or clear the reservation before maintenance.
            </p>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <AdminConfirmDialog
        open={confirmPut}
        title={`Put ${bed.bedCode} under maintenance?`}
        description="The bed stays visible on the map in red but cannot be booked or assigned until maintenance is completed."
        confirmLabel="Put under maintenance"
        tone="danger"
        pending={pending}
        onConfirm={() => void putUnderMaintenance()}
        onCancel={() => setConfirmPut(false)}
      />

      <AdminConfirmDialog
        open={confirmComplete}
        title={`Complete maintenance on ${bed.bedCode}?`}
        description="The bed will return to Open and become bookable again."
        confirmLabel="Complete maintenance"
        pending={pending}
        onConfirm={() => void completeMaintenance()}
        onCancel={() => setConfirmComplete(false)}
      />
    </section>
  );
}
