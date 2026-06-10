import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconChart } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listAdminElectricityBills } from '@/src/db/queries/admin';
import { formatDate, paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminElectricityPage() {
  const res = await listAdminElectricityBills();

  return (
    <>
      <PageHeader
        title="Electricity billing"
        description="Per-room electricity bills, split equally across monthly residents. Daily and weekly stays are excluded from the split (operator absorbs that share)."
      />
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/electricity/new"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
        >
          + New electricity bill
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
      )}
    </>
  );
}
