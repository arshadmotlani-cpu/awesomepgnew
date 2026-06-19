'use client';

import { useActionState, useEffect, useState } from 'react';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import {
  archiveCheckoutSettlementAction,
  deleteCheckoutSettlementAction,
  rebuildCheckoutSettlementAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';

const idle: CheckoutSettlementActionState = { status: 'idle' };

export function CheckoutSettlementAdminActions({
  settlementId,
  status,
  amountsLocked,
}: {
  settlementId: string;
  status: string;
  amountsLocked: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCheckoutSettlementAction,
    idle,
  );
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildCheckoutSettlementAction,
    idle,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveCheckoutSettlementAction,
    idle,
  );

  const locked =
    amountsLocked || status === 'refund_paid' || status === 'completed' || status === 'archived';

  useEffect(() => {
    if (rebuildState.status === 'ok') {
      setDeleteOpen(false);
    }
  }, [rebuildState.status]);

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Rebuild amounts, archive, or delete this checkout record — use only when something looks wrong."
      defaultOpen={false}
    >
      <form action={rebuildAction}>
        <input type="hidden" name="settlementId" value={settlementId} />
        <button
          type="submit"
          disabled={rebuildPending || locked}
          className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
        >
          Rebuild checkout amounts
        </button>
        <p className="mt-1 text-xs text-apg-silver">
          Recalculates from the move-out request and deposit records. Does not change the ledger or
          bed status.
        </p>
        {rebuildState.status === 'error' ? (
          <p className="mt-1 text-xs text-rose-300">{rebuildState.message}</p>
        ) : null}
        {rebuildState.status === 'ok' ? (
          <p className="mt-1 text-xs text-emerald-300">{rebuildState.message}</p>
        ) : null}
      </form>

      <form action={archiveAction}>
        <input type="hidden" name="settlementId" value={settlementId} />
        <button
          type="submit"
          disabled={archivePending || status === 'archived'}
          className="w-full rounded-lg border border-amber-400/30 px-3 py-2 text-left text-sm font-medium text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
        >
          Archive checkout
        </button>
        <p className="mt-1 text-xs text-apg-silver">Hides from daily queues. History is kept.</p>
        {archiveState.status === 'error' ? (
          <p className="mt-1 text-xs text-rose-300">{archiveState.message}</p>
        ) : null}
      </form>

      {!deleteOpen ? (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={locked}
          className="w-full rounded-lg border border-rose-400/30 px-3 py-2 text-left text-sm font-medium text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
        >
          Delete checkout record
        </button>
      ) : (
        <form action={deleteAction} className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3">
          <input type="hidden" name="settlementId" value={settlementId} />
          <p className="text-xs text-rose-100">
            Removes this checkout row only. Deposit records, bed status, and booking stay unchanged.
            Type <strong>DELETE</strong> to confirm.
          </p>
          <input
            name="confirmText"
            placeholder="DELETE"
            className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={deletePending}
              className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              {deletePending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver"
            >
              Cancel
            </button>
          </div>
          {deleteState.status === 'error' ? (
            <p className="text-xs text-rose-300">{deleteState.message}</p>
          ) : null}
        </form>
      )}
    </AdminAdvancedToolsSection>
  );
}
