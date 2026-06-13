import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { BulkBillingWhatsAppReminder } from '@/src/components/admin/BulkBillingWhatsAppReminder';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { AdminElectricityInvoiceReminderRow, AdminRentInvoiceRow } from '@/src/db/queries/admin';
import type { BillingReminderQueueItem } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type DepositRow = {
  bookingId: string;
  customerFullName: string;
  customerPhone: string;
  bedCode: string;
  collectedPaise: number;
  refundableBalancePaise: number;
};

export function PgEntityResidentsPanel({
  pgName,
  rentInvoices,
  electricityInvoices,
  deposits,
}: {
  pgName: string;
  rentInvoices: AdminRentInvoiceRow[];
  electricityInvoices: AdminElectricityInvoiceReminderRow[];
  deposits: DepositRow[];
}) {
  const rentQueue: BillingReminderQueueItem[] = rentInvoices
    .filter((r) => r.status === 'pending' || r.status === 'overdue')
    .map((r) => ({
      id: r.id,
      kind: 'rent' as const,
      customerName: r.customerFullName,
      phone: r.customerPhone,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      amountPaise: r.rentPaise,
      dueDate: r.dueDate,
      billingMonth: r.billingMonth,
      isOverdue: r.status === 'overdue',
    }));

  const elecQueue: BillingReminderQueueItem[] = electricityInvoices.map((r) => ({
    id: r.id,
    kind: 'electricity' as const,
    customerName: r.customerFullName,
    phone: r.customerPhone,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    amountPaise: r.amountPaise,
    dueDate: r.dueDate,
    billingMonth: r.billingMonth,
    isOverdue: r.isOverdue,
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Rent · {pgName}</h2>
            <p className="text-sm text-apg-silver">Individual residents — actionable at this level only</p>
          </div>
          <Link
            href="/admin/rent"
            className="text-xs font-medium text-[#FF5A1F] hover:underline"
          >
            Full rent ledger →
          </Link>
        </div>
        {rentQueue.length > 0 ? (
          <BulkBillingWhatsAppReminder kind="rent" items={rentQueue} />
        ) : null}
        <EntityTable
          empty="No rent invoices for this PG."
          rows={rentInvoices.map((r) => ({
            key: r.id,
            name: r.customerFullName,
            phone: r.customerPhone,
            location: [r.roomNumber ? `R${r.roomNumber}` : null, r.bedCode].filter(Boolean).join(' · '),
            amount: r.rentPaise,
            status: r.status,
            meta: formatDate(r.billingMonth),
            whatsapp:
              r.status === 'pending' || r.status === 'overdue' ? (
                <AdminBillingWhatsAppButton
                  kind="rent"
                  customerName={r.customerFullName}
                  phone={r.customerPhone}
                  pgName={r.pgName}
                  roomNumber={r.roomNumber}
                  amountPaise={r.rentPaise}
                  dueDate={r.dueDate}
                  billingMonth={r.billingMonth}
                  isOverdue={r.status === 'overdue'}
                />
              ) : null,
          }))}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Electricity · {pgName}</h2>
            <p className="text-sm text-apg-silver">Meter-wise resident shares</p>
          </div>
          <Link href="/admin/electricity" className="text-xs font-medium text-[#FF5A1F] hover:underline">
            Full electricity ledger →
          </Link>
        </div>
        {elecQueue.length > 0 ? (
          <BulkBillingWhatsAppReminder kind="electricity" items={elecQueue} />
        ) : null}
        <EntityTable
          empty="No electricity invoices for this PG."
          rows={electricityInvoices.map((r) => ({
            key: r.id,
            name: r.customerFullName,
            phone: r.customerPhone,
            location: r.roomNumber ? `R${r.roomNumber}` : '—',
            amount: r.amountPaise,
            status: r.isOverdue ? 'overdue' : 'pending',
            meta: r.invoiceNumber,
            whatsapp: (
              <AdminBillingWhatsAppButton
                kind="electricity"
                customerName={r.customerFullName}
                phone={r.customerPhone}
                pgName={r.pgName}
                roomNumber={r.roomNumber}
                amountPaise={r.amountPaise}
                dueDate={r.dueDate}
                billingMonth={r.billingMonth}
                isOverdue={r.isOverdue}
              />
            ),
          }))}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Deposits · {pgName}</h2>
          </div>
          <Link href="/admin/deposits" className="text-xs font-medium text-[#FF5A1F] hover:underline">
            Deposit ledger →
          </Link>
        </div>
        <EntityTable
          empty="No deposit records for this PG."
          rows={deposits.map((d) => ({
            key: d.bookingId,
            name: d.customerFullName,
            phone: d.customerPhone,
            location: d.bedCode,
            amount: d.collectedPaise,
            status: d.refundableBalancePaise > 0 ? 'held' : 'settled',
            meta: `Refundable ${paiseToInr(d.refundableBalancePaise)}`,
            whatsapp: null,
            href: `/admin/deposits/${d.bookingId}`,
          }))}
        />
      </section>
    </div>
  );
}

function EntityTable({
  rows,
  empty,
}: {
  empty: string;
  rows: Array<{
    key: string;
    name: string;
    phone: string;
    location: string;
    amount: number;
    status: string;
    meta?: string;
    whatsapp?: ReactNode;
    href?: string;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
        {empty}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <Table>
        <THead>
          <TR>
            <TH>Resident</TH>
            <TH>Room · bed</TH>
            <TH className="text-right">Amount</TH>
            <TH>Status</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.key}>
              <TD>
                <p className="font-medium text-white">{r.name}</p>
                <p className="font-mono text-[11px] text-zinc-500">{r.phone}</p>
                {r.meta ? <p className="text-xs text-apg-silver">{r.meta}</p> : null}
              </TD>
              <TD className="text-xs text-apg-silver">{r.location}</TD>
              <TD className="text-right tabular-nums">{paiseToInr(r.amount)}</TD>
              <TD>
                <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
              </TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.whatsapp}
                  {r.href ? (
                    <Link
                      href={r.href}
                      className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-apg-silver hover:text-white"
                    >
                      Ledger
                    </Link>
                  ) : null}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
