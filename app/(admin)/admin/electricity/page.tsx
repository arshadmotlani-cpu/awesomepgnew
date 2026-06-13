import Link from 'next/link';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { BulkBillingWhatsAppReminder } from '@/src/components/admin/BulkBillingWhatsAppReminder';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconChart } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  listAdminElectricityBills,
  listAdminElectricityInvoicesForReminders,
} from '@/src/db/queries/admin';
import type { BillingReminderQueueItem } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminElectricityPage() {
  const [res, pendingInvoices] = await Promise.all([
    listAdminElectricityBills(),
    listAdminElectricityInvoicesForReminders(),
  ]);

  const electricityReminderQueue: BillingReminderQueueItem[] = pendingInvoices.ok
    ? pendingInvoices.data.map((r) => ({
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
      }))
    : [];

  return (
    <>
      <PageHeader
        title="Electricity bills (all PGs)"
        description="Remind residents via WhatsApp for unpaid shares, or manage room bills per PG."
      />

      {!pendingInvoices.ok ? <DbStatusBanner error={pendingInvoices.error} /> : null}

      <BulkBillingWhatsAppReminder kind="electricity" items={electricityReminderQueue} />

      {pendingInvoices.ok && pendingInvoices.data.length > 0 ? (
        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-white">Unpaid electricity invoices</h2>
          <Table>
            <THead>
              <TR>
                <TH>Resident</TH>
                <TH>PG · Room</TH>
                <TH>Due</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {pendingInvoices.data.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="text-sm">{r.customerFullName}</div>
                    <div className="font-mono text-[11px] text-zinc-500">{r.customerPhone}</div>
                  </TD>
                  <TD className="text-xs">
                    {r.pgName} · {r.roomNumber}
                  </TD>
                  <TD className="text-xs">{formatDate(r.dueDate)}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(r.amountPaise)}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.isOverdue ? 'rose' : 'amber'}>
                        {r.isOverdue ? 'Overdue' : 'Pending'}
                      </Badge>
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
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <Link href="/admin/pgs" className="text-sm text-[#FF5A1F] hover:underline">
          ← Manage per PG
        </Link>
        <Link
          href="/admin/electricity/new"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
        >
          + Manual bill (legacy)
        </Link>
      </div>

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconChart />}
          title="No electricity bills recorded"
          description="Create a bill from a meter reading to fan out per-resident invoices."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Room bills</h2>
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH>PG · Room</TH>
                <TH className="text-right">Units</TH>
                <TH className="text-right">Rate</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Per resident</TH>
                <TH className="text-right">Residents</TH>
                <TH className="text-right">Invoices (paid)</TH>
                <TH className="text-right">Remainder</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {res.data.map((b) => (
                <TR key={b.id}>
                  <TD className="text-xs">{formatDate(b.billingMonth)}</TD>
                  <TD>
                    {b.pgName} · {b.roomNumber}
                  </TD>
                  <TD className="text-right">{b.unitsConsumed}</TD>
                  <TD className="text-right">{paiseToInr(b.ratePerUnitPaise)}</TD>
                  <TD className="text-right font-medium">{paiseToInr(b.totalPaise)}</TD>
                  <TD className="text-right">{paiseToInr(b.perResidentPaise)}</TD>
                  <TD className="text-right">{b.monthlyOccupantCount}</TD>
                  <TD className="text-right">
                    {b.invoicesPaidCount} / {b.invoicesCount}
                  </TD>
                  <TD className="text-right text-xs text-zinc-500">
                    {paiseToInr(b.roundingRemainderPaise)}
                  </TD>
                  <TD className="text-xs text-zinc-500">{formatDate(b.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      )}
    </>
  );
}
