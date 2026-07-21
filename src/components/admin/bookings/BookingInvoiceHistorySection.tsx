import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { buildAdminInvoiceHrefMap } from '@/src/lib/billing/invoiceHrefMap';

type RentInvoiceRow = {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  status: string;
  rentPaise: number;
  paidPrincipalPaise: number;
  paidLateFeePaise: number;
};

type ElectricityInvoiceRow = {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  status: string;
  amountPaise: number;
  paidPaise: number;
};

export function BookingInvoiceHistorySection({
  residentId,
  residentName,
  rentInvoices,
  electricityInvoices,
  rentInvoiceHrefMap,
}: {
  residentId: string;
  residentName: string;
  rentInvoices: RentInvoiceRow[];
  electricityInvoices: ElectricityInvoiceRow[];
  rentInvoiceHrefMap: Record<string, string>;
}) {
  const hasRows = rentInvoices.length > 0 || electricityInvoices.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4 text-sm text-apg-silver">
        <p className="font-semibold text-white">Booking history only</p>
        <p className="mt-1">
          Collect payments, record dues, and approve proofs on the{' '}
          <Link
            href={`/admin/residents/${residentId}#financial`}
            className="font-semibold text-[#FF5A1F] hover:underline"
          >
            {residentName} resident profile
          </Link>{' '}
          or{' '}
          <Link href="/admin/billing" className="font-semibold text-[#FF5A1F] hover:underline">
            Billing Center
          </Link>
          . All amounts come from invoices — not booking balances.
        </p>
      </div>

      {!hasRows ? (
        <div className="rounded-2xl border border-white/10 bg-[#121820] p-5">
          <p className="text-sm text-apg-silver">No rent or electricity invoices on this booking yet.</p>
        </div>
      ) : null}

      {rentInvoices.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Rent invoices</h2>
          <Table>
            <THead>
              <TR>
                <TH>Invoice #</TH>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH className="text-right">Rent</TH>
                <TH className="text-right">Paid</TH>
              </TR>
            </THead>
            <TBody>
              {rentInvoices.map((inv) => {
                const href = rentInvoiceHrefMap[inv.id];
                return (
                  <TR key={inv.id}>
                    <TD className="font-mono text-sm">
                      {href ? (
                        <Link href={href} className="text-[#FF5A1F] hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      ) : (
                        inv.invoiceNumber
                      )}
                    </TD>
                    <TD className="text-xs text-apg-silver">{inv.billingMonth.slice(0, 7)}</TD>
                    <TD>
                      <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{paiseToInr(inv.rentPaise)}</TD>
                    <TD className="text-right tabular-nums">
                      {paiseToInr(inv.paidPrincipalPaise + inv.paidLateFeePaise)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}

      {electricityInvoices.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Electricity invoices</h2>
          <Table>
            <THead>
              <TR>
                <TH>Invoice #</TH>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Paid</TH>
              </TR>
            </THead>
            <TBody>
              {electricityInvoices.map((inv) => (
                <TR key={inv.id}>
                  <TD className="font-mono text-sm">{inv.invoiceNumber}</TD>
                  <TD className="text-xs text-apg-silver">{inv.billingMonth.slice(0, 7)}</TD>
                  <TD>
                    <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{paiseToInr(inv.amountPaise)}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(inv.paidPaise)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
