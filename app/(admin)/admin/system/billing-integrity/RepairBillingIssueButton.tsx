'use client';

import { useTransition } from 'react';
import { repairBillingIssueAction } from './actions';
import type { BillingIntegrityIssue } from '@/src/services/billingIntegrityCheck';

export function RepairBillingIssueButton({ issue }: { issue: BillingIntegrityIssue }) {
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
        if (issue.bookingId) fd.set('bookingId', issue.bookingId);
        if (issue.invoiceId) fd.set('invoiceId', issue.invoiceId);
        if (issue.sourceInvoiceId) fd.set('sourceInvoiceId', issue.sourceInvoiceId);
        if (issue.sourceTable) fd.set('sourceTable', issue.sourceTable);
        if (issue.unifiedInvoiceId) fd.set('unifiedInvoiceId', issue.unifiedInvoiceId);
        if (issue.paymentId) fd.set('paymentId', issue.paymentId);
        if (issue.roomId) fd.set('roomId', issue.roomId);
        if (issue.roomNumber) fd.set('roomNumber', issue.roomNumber);
        if (issue.billingMonth) fd.set('billingMonth', issue.billingMonth);
        start(async () => {
          await repairBillingIssueAction(fd);
        });
      }}
      className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
    >
      {pending ? '…' : 'Repair'}
    </button>
  );
}
