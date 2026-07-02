'use client';

import { useTransition } from 'react';
import { repairAuthIssueAction } from './actions';
import type { AuthIntegrityIssue } from '@/src/services/authIntegrityCheck';

export function RepairAuthIssueButton({ issue }: { issue: AuthIntegrityIssue }) {
  const [pending, start] = useTransition();

  if (!issue.autoRepairable) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set('checkType', issue.checkType);
        fd.set('customerId', issue.customerId);
        fd.set('customerName', issue.customerName);
        fd.set('detail', issue.detail);
        fd.set('autoRepairable', String(issue.autoRepairable));
        if (issue.email) fd.set('email', issue.email);
        if (issue.phone) fd.set('phone', issue.phone);
        if (issue.relatedCustomerId) fd.set('relatedCustomerId', issue.relatedCustomerId);
        if (issue.metadata) fd.set('metadata', JSON.stringify(issue.metadata));
        start(async () => {
          await repairAuthIssueAction(fd);
        });
      }}
      className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
    >
      {pending ? '…' : 'Repair'}
    </button>
  );
}
