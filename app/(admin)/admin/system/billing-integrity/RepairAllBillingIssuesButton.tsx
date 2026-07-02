'use client';

import { useTransition } from 'react';
import { repairAllBillingIssuesAction } from './actions';

export function RepairAllBillingIssuesButton({ billingMonth }: { billingMonth: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await repairAllBillingIssuesAction(billingMonth);
        });
      }}
      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
    >
      {pending ? 'Repairing…' : 'Repair all auto-fixable'}
    </button>
  );
}
