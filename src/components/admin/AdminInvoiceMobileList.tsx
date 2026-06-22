'use client';

import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { FinancialInvoiceStatus, FinancialInvoiceType } from '@/src/db/schema/enums';

export type AdminInvoiceMobileRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  invoiceType: FinancialInvoiceType;
  amountPaise: number;
  status: FinancialInvoiceStatus;
  createdAt: Date;
  dueDate: string | null;
  paidAt: Date | null;
};

export function AdminInvoiceMobileList({ invoices }: { invoices: AdminInvoiceMobileRow[] }) {
  if (invoices.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver lg:hidden">
        No invoices match this filter.
      </p>
    );
  }

  return (
    <ul className="space-y-3 lg:hidden" aria-label="Invoices">
      {invoices.map((inv) => (
        <li key={inv.id}>
          <Link
            href={invoiceDetailHref(inv.id, 'admin')}
            className="block rounded-xl border border-white/10 bg-[#1A1F27] p-4 transition hover:border-[#FF5A1F]/40 hover:bg-[#1F2630] active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-[#FF5A1F]">{inv.invoiceNumber}</p>
                <p className="mt-1 truncate text-sm font-medium text-white">{inv.customerName}</p>
                <p className="truncate text-xs text-apg-silver">{inv.customerPhone}</p>
              </div>
              <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-apg-silver">PG</dt>
                <dd className="font-medium text-white">{inv.pgName}</dd>
              </div>
              <div>
                <dt className="text-apg-silver">Type</dt>
                <dd className="font-medium text-white">{titleCase(inv.invoiceType.replace('_', ' '))}</dd>
              </div>
              <div>
                <dt className="text-apg-silver">Room / bed</dt>
                <dd className="font-medium text-white">
                  {[inv.roomNumber ? `Room ${inv.roomNumber}` : null, inv.bedCode ? `Bed ${inv.bedCode}` : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-apg-silver">Amount</dt>
                <dd className="font-semibold text-white">{paiseToInr(inv.amountPaise)}</dd>
              </div>
              <div>
                <dt className="text-apg-silver">Created</dt>
                <dd className="text-white">{formatDate(inv.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-apg-silver">{inv.paidAt ? 'Paid' : 'Due'}</dt>
                <dd className="text-white">
                  {inv.paidAt ? formatDate(inv.paidAt) : inv.dueDate ? formatDate(inv.dueDate) : '—'}
                </dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
