'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  clearBedManualReservedAction,
  setBedManualReservedAction,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { RESERVE_MIN_PERIOD_DAYS } from '@/src/lib/bedReservePolicy';
import { addDays, formatDate, todayString } from '@/src/lib/dates';

export function BedMapManualReservedToggle({
  pgId,
  bedId,
  bedCode,
  manualReservedCheckIn,
  disabled,
}: {
  pgId: string;
  bedId: string;
  bedCode: string;
  manualReservedCheckIn?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const minStart = todayString();
  const [reserveStart, setReserveStart] = useState(minStart);
  const [checkInDate, setCheckInDate] = useState(() =>
    formatDate(addDays(minStart, Math.max(RESERVE_MIN_PERIOD_DAYS, 7))),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMark, setConfirmMark] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const isReserved = Boolean(manualReservedCheckIn);

  async function markReserved() {
    setPending(true);
    setError(null);
    try {
      const result = await setBedManualReservedAction(bedId, pgId, checkInDate, reserveStart);
      if (!result.ok) {
        setError(result.error ?? 'Could not mark reserved.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirmMark(false);
    }
  }

  async function clearReserved() {
    setPending(true);
    setError(null);
    try {
      const result = await clearBedManualReservedAction(bedId, pgId);
      if (!result.ok) {
        setError(result.error ?? 'Could not clear reserve mark.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirmClear(false);
    }
  }

  if (disabled) return null;

  return (
    <section className="rounded-xl border border-violet-400/25 bg-violet-500/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
        Reserve mark
      </p>
      <p className="mt-1 text-sm text-apg-silver">
        {isReserved
          ? `${bedCode} shows as Reserved until ${manualReservedCheckIn}. Daily/weekly guests can still book during this window.`
          : `Mark ${bedCode} reserved for someone arriving later — same as customer 50% reserve on the website.`}
      </p>

      {isReserved ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmClear(true)}
          className="mt-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Clear reserve mark
        </button>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-apg-silver">
              Reserve from
              <input
                type="date"
                min={minStart}
                value={reserveStart}
                onChange={(e) => setReserveStart(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Holder check-in date
              <input
                type="date"
                min={formatDate(addDays(reserveStart, RESERVE_MIN_PERIOD_DAYS))}
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmMark(true)}
            className="mt-3 w-full rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-50"
          >
            Mark as reserved
          </button>
        </>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <AdminConfirmDialog
        open={confirmMark}
        title={`Mark ${bedCode} as reserved?`}
        description="The bed will show as Reserved on the admin and customer website until the check-in date. Daily and weekly stays remain allowed; monthly bookings are blocked."
        confirmLabel="Mark reserved"
        tone="default"
        pending={pending}
        onConfirm={() => void markReserved()}
        onCancel={() => setConfirmMark(false)}
      />

      <AdminConfirmDialog
        open={confirmClear}
        title={`Clear reserve mark on ${bedCode}?`}
        description="The bed will show as open for booking again on the website."
        confirmLabel="Clear mark"
        pending={pending}
        onConfirm={() => void clearReserved()}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
