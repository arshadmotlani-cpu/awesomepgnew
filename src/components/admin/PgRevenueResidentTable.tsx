import Link from 'next/link';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { paiseToInr } from '@/src/lib/format';
import type { PgRevenueResidentRow } from '@/src/services/pgRevenueResidents';

function Money({ paise }: { paise: number }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  return <span className="font-medium text-white">{paiseToInr(paise)}</span>;
}

function DueMoney({ paise }: { paise: number }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  return <span className="font-medium text-amber-300">{paiseToInr(paise)}</span>;
}

export function PgRevenueResidentTable({
  rows,
  billingMonth,
  pgId,
}: {
  rows: PgRevenueResidentRow[];
  billingMonth: string;
  pgId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
        No assigned residents for this PG in the selected month.
      </p>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      rentDue: acc.rentDue + r.rentDuePaise,
      rentPaid: acc.rentPaid + r.rentPaidPaise,
      depositOutstanding: acc.depositOutstanding + r.depositOutstandingPaise,
      elecDue: acc.elecDue + r.electricityDuePaise,
      totalOutstanding: acc.totalOutstanding + r.totalOutstandingPaise,
    }),
    { rentDue: 0, rentPaid: 0, depositOutstanding: 0, elecDue: 0, totalOutstanding: 0 },
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-apg-silver">
        Operational collection view — assigned residents only.{' '}
        <Link
          href={`/admin/deposits/collected?pgId=${pgId}&month=${billingMonth}`}
          className="text-[#FF5A1F] hover:underline"
        >
          Deposit collection details →
        </Link>
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Room</TH>
              <TH>Bed</TH>
              <TH className="text-right">Rent due</TH>
              <TH className="text-right">Rent paid</TH>
              <TH className="text-right">Deposit req.</TH>
              <TH className="text-right">Deposit paid</TH>
              <TH className="text-right">Deposit out.</TH>
              <TH className="text-right">Elec. due</TH>
              <TH className="text-right">Total out.</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.bookingId} className="hover:bg-white/[0.03]">
                <TD>
                  <Link
                    href={`/admin/residents/${r.customerId}`}
                    className="font-medium text-white hover:text-[#FF5A1F]"
                  >
                    {r.customerName}
                  </Link>
                  <p className="font-mono text-[11px] text-zinc-500">{r.phone}</p>
                </TD>
                <TD>{r.roomNumber}</TD>
                <TD>{r.bedCode}</TD>
                <TD className="text-right">
                  <DueMoney paise={r.rentDuePaise} />
                </TD>
                <TD className="text-right">
                  <Money paise={r.rentPaidPaise} />
                </TD>
                <TD className="text-right">
                  <Money paise={r.depositRequiredPaise} />
                </TD>
                <TD className="text-right">
                  <Money paise={r.depositPaidPaise} />
                </TD>
                <TD className="text-right">
                  <DueMoney paise={r.depositOutstandingPaise} />
                </TD>
                <TD className="text-right">
                  <DueMoney paise={r.electricityDuePaise} />
                </TD>
                <TD className="text-right font-semibold">
                  <DueMoney paise={r.totalOutstandingPaise} />
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="border-t border-white/10 bg-white/[0.03] text-sm font-semibold text-white">
            <TR>
              <TD colSpan={3}>Totals ({rows.length} residents)</TD>
              <TD className="text-right">{paiseToInr(totals.rentDue)}</TD>
              <TD className="text-right">{paiseToInr(totals.rentPaid)}</TD>
              <TD colSpan={2} />
              <TD className="text-right">{paiseToInr(totals.depositOutstanding)}</TD>
              <TD className="text-right">{paiseToInr(totals.elecDue)}</TD>
              <TD className="text-right text-amber-300">{paiseToInr(totals.totalOutstanding)}</TD>
            </TR>
          </tfoot>
        </Table>
      </div>
    </div>
  );
}
