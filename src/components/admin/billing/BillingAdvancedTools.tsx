'use client';

import { useActionState } from 'react';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { BillingOverviewPanel } from '@/src/components/admin/BillingOverviewPanel';
import { CollectionsBillingTools } from '@/src/components/admin/CollectionsBillingTools';
import {
  cancelPendingInvoicesAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';
import type { RentBillingOverviewRow, BillingCycleOperationRow } from '@/src/services/rentInvoices';

const idle: ActionState = { status: 'idle' };

export function BillingAdvancedTools({
  billingMonth,
  canGenerateRent,
  canSendLinks,
  billingOverview,
  billingCycleOps,
  needsBillCount,
  allowManualBackfill,
}: {
  billingMonth: string;
  canGenerateRent: boolean;
  canSendLinks: boolean;
  billingOverview: RentBillingOverviewRow[];
  billingCycleOps: {
    dueSoon: BillingCycleOperationRow[];
    generatedPending: BillingCycleOperationRow[];
  };
  needsBillCount: number;
  allowManualBackfill?: boolean;
}) {
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPendingInvoicesAction,
    idle,
  );
  const monthLabel = billingMonth.slice(0, 7);

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Create bills, full billing queue, bulk tools, and rarely used actions."
      defaultOpen={false}
    >
      <BillingOverviewPanel
        billingMonth={billingMonth}
        rows={billingOverview}
        canGenerateRent={canGenerateRent}
        canSendLinks={canSendLinks}
        dueSoon={billingCycleOps.dueSoon}
        generatedPending={billingCycleOps.generatedPending}
        allowManualBackfill={allowManualBackfill}
      />

      <CollectionsBillingTools billingMonth={billingMonth} canGenerateRent={canGenerateRent} />

      {canGenerateRent ? (
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
          <h3 className="text-sm font-semibold text-white">Undo pending bills</h3>
          <p className="mt-1 text-xs text-apg-silver">
            Removes unpaid bills for {monthLabel} only — not bills already paid.
          </p>
          <form action={cancelAction} className="mt-3 inline-flex flex-col gap-1">
            <input type="hidden" name="billingMonth" value={billingMonth} />
            <button
              type="submit"
              disabled={cancelPending}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
            >
              {cancelPending ? 'Cancelling…' : `Undo pending bills for ${monthLabel}`}
            </button>
            {cancelState.status === 'ok' ? (
              <span className="text-[11px] text-emerald-300">{cancelState.message}</span>
            ) : cancelState.status === 'error' ? (
              <span className="text-[11px] text-rose-300">{cancelState.message}</span>
            ) : null}
          </form>
        </div>
      ) : null}
    </AdminAdvancedToolsSection>
  );
}
