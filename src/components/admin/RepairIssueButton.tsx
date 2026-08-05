'use client';

import { useTransition } from 'react';
import { runBrainIssueRepairAction } from '@/app/(admin)/admin/system/health-report/actions';

export function RepairIssueButton({
  fingerprint,
  disabled,
}: {
  fingerprint: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        start(async () => {
          const result = await runBrainIssueRepairAction(fingerprint);
          if (!result.ok) {
            window.alert(result.message ?? 'Repair failed');
            return;
          }
          window.location.reload();
        });
      }}
      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
    >
      {pending ? 'Repairing…' : 'Repair'}
    </button>
  );
}
