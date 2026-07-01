'use client';

import { InvoiceAdminRowActions } from '@/src/components/admin/InvoiceAdminRowActions';
import { ExpressCollectionButton } from '@/src/components/admin/ExpressCollectionButton';
import { MarkAsPaidCashButton } from '@/src/components/admin/MarkAsPaidCashButton';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import { formatDate, paiseToInr } from '@/src/lib/format';

export function ResidentInlineOpenBills({
  customerId,
  customerName,
  phone,
  pgId,
  pgName,
  roomNumber,
  bookingId,
  billingDefaults,
  financialSummary,
  cashSettlement,
}: {
  customerId: string;
  customerName: string;
  phone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bookingId: string;
  billingDefaults: ResidentBillingFormDefaults | null;
  financialSummary: ResidentFinancialSummary;
  cashSettlement?: { canSettle: boolean; adminName: string } | null;
}) {
  const openItems = [
    ...financialSummary.rent.items,
    ...financialSummary.deposit.items,
    ...financialSummary.electricity.items,
    ...financialSummary.other.items,
  ]
    .filter((i) => i.outstandingPaise > 0)
    .sort((a, b) => {
      const aOverdue = a.status === 'overdue' ? 0 : 1;
      const bOverdue = b.status === 'overdue' ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return b.outstandingPaise - a.outstandingPaise;
    })
    .slice(0, 3);

  if (openItems.length === 0) return null;

  return (
    <section id="open-bills" className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Open bills — collect now</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Top {openItems.length} outstanding — one action per line, no need to open Advanced tools.
      </p>
      <ul className="mt-4 divide-y divide-white/5">
        {openItems.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-apg-silver">
                {paiseToInr(item.outstandingPaise)} due
                {item.dueDate ? ` · ${formatDate(item.dueDate)}` : ''}
                {item.status === 'overdue' ? ' · overdue' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {cashSettlement?.canSettle && item.financialInvoiceId ? (
                <MarkAsPaidCashButton
                  financialInvoiceId={item.financialInvoiceId}
                  balanceDuePaise={item.outstandingPaise}
                  residentName={customerName}
                  invoiceNumber={item.invoiceNumber ?? item.label}
                  adminName={cashSettlement.adminName}
                  canSettle
                  compact
                />
              ) : null}
              {item.financialInvoiceId &&
              (item.kind === 'rent' || item.kind === 'electricity') ? (
                <InvoiceAdminRowActions financialInvoiceId={item.financialInvoiceId} />
              ) : null}
              {billingDefaults ? (
                <ExpressCollectionButton
                  customerId={customerId}
                  bookingId={bookingId}
                  customerName={customerName}
                  billingDefaults={billingDefaults}
                  triggerClassName="inline-flex items-center justify-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
                  triggerLabel="Record payment"
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
