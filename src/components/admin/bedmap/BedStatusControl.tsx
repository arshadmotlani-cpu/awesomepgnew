'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  clearBedManualReservedAction,
  completeBedMaintenanceAction,
  putBedUnderMaintenanceAction,
  setBedManualOccupiedAction,
  setBedManualReservedAction,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { RESERVE_MIN_PERIOD_DAYS } from '@/src/lib/bedReservePolicy';
import { BED_MAINTENANCE_MARKED_MESSAGE } from '@/src/lib/bedOccupancyMessages';
import { addDays, formatDate, todayString } from '@/src/lib/dates';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

export type BedDisplayStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

const STATUS_OPTIONS: Array<{ value: BedDisplayStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Under Maintenance' },
];

export function deriveBedDisplayStatus(bed: PgBedMapBed): BedDisplayStatus {
  if (bed.bedStatus === 'maintenance') return 'maintenance';
  if (bed.occupant || bed.manualOccupied) return 'occupied';
  if (bed.reserved || bed.manualReservedCheckIn) return 'reserved';
  return 'available';
}

export function BedStatusControl({ pgId, bed }: { pgId: string; bed: PgBedMapBed }) {
  const router = useRouter();
  const current = useMemo(() => deriveBedDisplayStatus(bed), [bed]);
  const hasTenant = Boolean(bed.occupant || bed.reserved);
  const [selected, setSelected] = useState<BedDisplayStatus>(current);
  const [reserveStart, setReserveStart] = useState(todayString());
  const [checkInDate, setCheckInDate] = useState(() =>
    formatDate(addDays(todayString(), Math.max(RESERVE_MIN_PERIOD_DAYS, 7))),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

  const locked = hasTenant;
  const dirty = selected !== current;

  useEffect(() => {
    setSelected(current);
  }, [current, bed.bedId]);

  async function applyStatus() {
    if (!dirty || locked) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      if (selected === 'available') {
        if (bed.bedStatus === 'maintenance') {
          const result = await completeBedMaintenanceAction(pgId, bed.bedId);
          if (!result.ok) {
            setError(result.error ?? 'Could not mark available.');
            return;
          }
        }
        if (bed.manualOccupied) {
          const result = await setBedManualOccupiedAction(bed.bedId, pgId, false);
          if (!result.ok) {
            setError(result.error ?? 'Could not clear occupied mark.');
            return;
          }
        }
        if (bed.manualReservedCheckIn) {
          const result = await clearBedManualReservedAction(bed.bedId, pgId);
          if (!result.ok) {
            setError(result.error ?? 'Could not clear reserved mark.');
            return;
          }
        }
      } else if (selected === 'occupied') {
        if (bed.bedStatus === 'maintenance') {
          setError('Complete maintenance first, or choose Under Maintenance.');
          return;
        }
        const result = await setBedManualOccupiedAction(bed.bedId, pgId, true);
        if (!result.ok) {
          setError(result.error ?? 'Could not mark occupied.');
          return;
        }
      } else if (selected === 'reserved') {
        if (bed.bedStatus === 'maintenance') {
          setError('Complete maintenance first.');
          return;
        }
        const result = await setBedManualReservedAction(bed.bedId, pgId, checkInDate, reserveStart);
        if (!result.ok) {
          setError(result.error ?? 'Could not mark reserved.');
          return;
        }
      } else if (selected === 'maintenance') {
        setConfirmMaintenance(true);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function confirmPutUnderMaintenance() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await putBedUnderMaintenanceAction(pgId, bed.bedId, {
        reason: 'other',
        reasonCustom: 'Under maintenance',
        startDate: todayString(),
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not put bed under maintenance.');
        return;
      }
      setSuccess(BED_MAINTENANCE_MARKED_MESSAGE);
      router.refresh();
    } finally {
      setPending(false);
      setConfirmMaintenance(false);
    }
  }

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === current)?.label ?? current;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">Bed status</p>
      <p className="mt-1 text-sm text-apg-silver">
        Shown on the admin map and customer website. Manage status here — not from Operations.
      </p>

      {locked ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-white">{statusLabel}</p>
          <p className="mt-1 text-xs text-apg-silver">
            {bed.occupant
              ? 'A resident is assigned. Complete move-out to change status.'
              : 'A booking holds this bed. Clear the reservation to change status.'}
          </p>
        </div>
      ) : (
        <>
          <label className="mt-3 block text-xs text-apg-silver">
            Status
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value as BedDisplayStatus)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {selected === 'reserved' && current !== 'reserved' ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-apg-silver">
                Reserve from
                <input
                  type="date"
                  min={todayString()}
                  value={reserveStart}
                  onChange={(e) => setReserveStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-apg-silver">
                Check-in date
                <input
                  type="date"
                  min={formatDate(addDays(reserveStart, RESERVE_MIN_PERIOD_DAYS))}
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          ) : null}

          {dirty ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void applyStatus()}
              className="mt-3 w-full rounded-lg bg-[#FF5A1F] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              Apply status
            </button>
          ) : null}
        </>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      {success ? <p className="mt-2 text-xs text-emerald-300">{success}</p> : null}

      <AdminConfirmDialog
        open={confirmMaintenance}
        title={`Put bed ${bed.bedCode} under maintenance?`}
        description="The bed stays visible on the website in red but cannot be booked until you set it back to Available."
        confirmLabel="Under maintenance"
        tone="danger"
        pending={pending}
        onConfirm={() => void confirmPutUnderMaintenance()}
        onCancel={() => setConfirmMaintenance(false)}
      />
    </section>
  );
}
