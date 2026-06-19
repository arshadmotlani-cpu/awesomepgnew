import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type PaidRow = {
  id: string;
  customerId?: string;
  customerFullName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string;
  rentPaise?: number;
  outstandingPaise?: number;
  paidAt?: Date | null;
  effectiveStatus?: string;
  status?: string;
};

export function BillingRecentCollections({
  rows,
  error,
}: {
  rows: PaidRow[];
  error: string | null;
}) {
  if (error) {
    return (
      <section className="mb-8">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-white">Recent collections</h2>
        </header>
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      </section>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">Recent collections</h2>
          <p className="mt-1 text-sm text-apg-silver">Payments recorded today and recently.</p>
        </div>
        <Link
          href="/admin/revenue/billing?tab=paid"
          className="text-sm font-semibold text-[#FF5A1F] hover:underline"
        >
          All paid bills →
        </Link>
      </header>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>PG · room</TH>
              <TH className="text-right">Amount</TH>
              <TH>Collected on</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.slice(0, 10).map((r) => {
              const amount = r.outstandingPaise ?? r.rentPaise ?? 0;
              const displayStatus = r.effectiveStatus ?? r.status ?? 'paid';
              return (
                <TR key={r.id}>
                  <TD>
                    {r.customerId ? (
                      <Link
                        href={`/admin/residents/${r.customerId}`}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : (
                      r.customerFullName
                    )}
                    <p className="font-mono text-[11px] text-apg-silver">{r.customerPhone}</p>
                  </TD>
                  <TD className="text-xs text-apg-silver">
                    {r.pgName} · R{r.roomNumber}
                  </TD>
                  <TD className="text-right tabular-nums">{paiseToInr(amount)}</TD>
                  <TD className="text-xs">{r.paidAt ? formatDate(r.paidAt) : '—'}</TD>
                  <TD>
                    <Badge tone={toneForStatus(displayStatus)}>{titleCase(displayStatus)}</Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </section>
  );
}
