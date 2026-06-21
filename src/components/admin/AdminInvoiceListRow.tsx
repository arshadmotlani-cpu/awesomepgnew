'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TD, TR } from '@/src/components/admin/Table';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { FinancialInvoiceStatus, FinancialInvoiceType } from '@/src/db/schema/enums';

type Row = {
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

export function AdminInvoiceListRow({ inv }: { inv: Row }) {
  const router = useRouter();
  const href = invoiceDetailHref(inv.id, 'admin');

  return (
    <TR
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
    >
      <TD>
        <span className="font-medium text-[#FF5A1F]">{inv.invoiceNumber}</span>
      </TD>
      <TD>
        <div>{inv.customerName}</div>
        <div className="text-xs text-apg-silver">{inv.customerPhone}</div>
      </TD>
      <TD>{inv.pgName}</TD>
      <TD>{inv.roomNumber ?? '—'}</TD>
      <TD>{inv.bedCode ?? '—'}</TD>
      <TD>{titleCase(inv.invoiceType.replace('_', ' '))}</TD>
      <TD className="text-right">{paiseToInr(inv.amountPaise)}</TD>
      <TD>
        <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
      </TD>
      <TD>{formatDate(inv.createdAt)}</TD>
      <TD>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</TD>
      <TD>{inv.paidAt ? formatDate(inv.paidAt) : '—'}</TD>
    </TR>
  );
}

export function AdminInvoiceListRowLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <TR
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer transition hover:bg-white/[0.03]"
    >
      {children}
    </TR>
  );
}
