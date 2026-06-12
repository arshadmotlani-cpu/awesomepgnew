'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setBedManualOccupiedAction } from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';

export function BedMapManualOccupiedToggle({
  pgId,
  bedId,
  bedCode,
  manualOccupied,
  disabled,
}: {
  pgId: string;
  bedId: string;
  bedCode: string;
  manualOccupied: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMarkOccupied, setConfirmMarkOccupied] = useState(false);
  const [confirmMarkAvailable, setConfirmMarkAvailable] = useState(false);

  async function apply(occupied: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = await setBedManualOccupiedAction(bedId, pgId, occupied);
      if (!result.ok) {
        setError(result.error ?? 'Could not update bed.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirmMarkOccupied(false);
      setConfirmMarkAvailable(false);
    }
  }

  if (disabled) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
        Show on website
      </p>
      <p className="mt-1 text-sm text-apg-silver">
        {manualOccupied
          ? `${bedCode} is marked occupied — customers cannot book it until you open it again.`
          : `${bedCode} is open — mark it occupied to hide from booking without assigning a tenant.`}
      </p>

      {manualOccupied ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmMarkAvailable(true)}
          className="mt-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Mark as open · book now
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmMarkOccupied(true)}
          className="mt-3 w-full rounded-lg border border-zinc-400/40 bg-zinc-700/30 px-3 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700/50 disabled:opacity-50"
        >
          Mark as occupied
        </button>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <AdminConfirmDialog
        open={confirmMarkOccupied}
        title={`Mark ${bedCode} as occupied?`}
        description="The bed will show as occupied on the admin map and customer website. No tenant is assigned — clear it whenever you want it bookable again."
        confirmLabel="Mark occupied"
        tone="default"
        pending={pending}
        onConfirm={() => void apply(true)}
        onCancel={() => setConfirmMarkOccupied(false)}
      />

      <AdminConfirmDialog
        open={confirmMarkAvailable}
        title={`Open ${bedCode} for booking?`}
        description="Customers will see this bed as available on the website again."
        confirmLabel="Mark open"
        pending={pending}
        onConfirm={() => void apply(false)}
        onCancel={() => setConfirmMarkAvailable(false)}
      />
    </section>
  );
}
