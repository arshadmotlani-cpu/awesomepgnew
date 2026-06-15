'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import {
  removeTenantFromBedAction,
  type MapActionState,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';

const idle: MapActionState = { ok: false };

export function BedMapRemoveTenantButton({
  pgId,
  bookingId,
  customerName,
  bedLabel,
  isOccupiedToday,
}: {
  pgId: string;
  bookingId: string;
  customerName: string;
  bedLabel: string;
  isOccupiedToday: boolean;
}) {
  const router = useRouter();
  const formId = `remove-tenant-${bookingId}`;
  const [state, formAction, pending] = useActionState(removeTenantFromBedAction, idle);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form id={formId} action={formAction} className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="pgId" value={pgId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Remove from bed</p>
      <p className="mt-1 text-sm text-rose-50">
        {isOccupiedToday
          ? `Check out ${customerName} today and free ${bedLabel}. Deposit handling follows your vacating rules (deduction waived).`
          : `Cancel ${customerName}'s future reservation on ${bedLabel}.`}
      </p>
      <label className="mt-3 block text-xs text-rose-100/90">
        Reason (optional)
        <input
          name="reason"
          type="text"
          placeholder="e.g. Assigned by mistake"
          className="apg-admin-field mt-1 w-full rounded-lg border border-rose-400/30 bg-[#1A1F27] px-2.5 py-1.5 text-sm text-white"
        />
      </label>
      <div className="mt-3">
        <AdminConfirmSubmit
          formId={formId}
          title={isOccupiedToday ? 'Remove tenant from bed today?' : 'Cancel bed reservation?'}
          description={
            isOccupiedToday
              ? `This completes checkout for ${customerName} immediately. The bed opens on the map and website.`
              : `This cancels the booking holding ${bedLabel} for ${customerName}.`
          }
          confirmLabel={isOccupiedToday ? 'Remove from bed' : 'Cancel reservation'}
          tone="danger"
          pending={pending}
          className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {isOccupiedToday ? 'Remove tenant from bed' : 'Cancel reservation'}
        </AdminConfirmSubmit>
      </div>
      {state.error ? (
        <p className="mt-2 text-xs leading-snug text-rose-200">{state.error}</p>
      ) : null}
    </form>
  );
}
