'use client';

import { useTransition } from 'react';
import { repairBedIssueAction } from './actions';
import type { BedAuditIssue } from '@/src/services/bedAudit';

export function RepairBedIssueButton({ issue }: { issue: BedAuditIssue }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set('kind', issue.kind);
        fd.set('bedId', issue.bedId);
        fd.set('bedCode', issue.bedCode);
        fd.set('roomNumber', issue.roomNumber);
        fd.set('pgId', issue.pgId);
        fd.set('pgName', issue.pgName);
        fd.set('detail', issue.detail);
        if (issue.bookingId) fd.set('bookingId', issue.bookingId);
        if (issue.customerId) fd.set('customerId', issue.customerId);
        start(async () => {
          await repairBedIssueAction(fd);
        });
      }}
      className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
    >
      {pending ? '…' : 'Repair'}
    </button>
  );
}
