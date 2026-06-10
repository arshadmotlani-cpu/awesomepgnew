import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listAdminDepositSummaries } from '@/src/db/queries/admin';
import { paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsPage() {
  const res = await listAdminDepositSummaries();

  return (
    <>
      <PageHeader
        title="Deposit management"
        description="Per-booking deposit balances. Every entry is append-only; deductions and refunds are signed at the storage layer so the running balance can't be silently corrupted."
      />
      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No deposits yet"
          description="Deposit ledger entries appear as soon as a booking payment lands or an admin records a deduction."
        />
      ) : (
        <>
          {(() => {
            const totalCollected = res.data.reduce(
              (acc, r) => acc + Number(r.collectedPaise),
              0,
            );
            const totalDeducted = res.data.reduce(
              (acc, r) => acc + Number(r.deductedPaise),
              0,
            );
            const totalRefunded = res.data.reduce(
              (acc, r) => acc + Number(r.refundedPaise),
              0,
            );
            const totalRefundable = res.data.reduce(
              (acc, r) => acc + Number(r.refundableBalancePaise),
              0,
            );
            return (
              <section className="mb-4 grid gap-3 sm:grid-cols-4">
                <StatCard label="Collected" value={paiseToInr(totalCollected)} />
                <StatCard label="Deducted" value={paiseToInr(totalDeducted)} accent />
                <StatCard label="Refunded" value={paiseToInr(totalRefunded)} />
                <StatCard label="Refundable balance" value={paiseToInr(totalRefundable)} />
              </section>
            );
          })()}
          <Table>
            <THead>
              <TR>
                <TH>Booking</TH>
                <TH>Resident</TH>
                <TH>Bed</TH>
                <TH className="text-right">Collected</TH>
                <TH className="text-right">Deducted</TH>
                <TH className="text-right">Refunded</TH>
                <TH className="text-right">Balance</TH>
                <TH className="text-right">Adjust</TH>
              </TR>
            </THead>
            <TBody>
              {res.data.map((r) => (
                <TR key={r.bookingId}>
                  <TD>
                    <Link
                      href={`/admin/bookings/${r.bookingId}`}
                      className="font-mono text-xs text-indigo-600 hover:underline"
                    >
                      {r.bookingCode}
                    </Link>
                  </TD>
                  <TD>
                    <div className="text-sm">{r.customerFullName}</div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      {r.customerPhone}
                    </div>
                  </TD>
                  <TD className="text-xs">
                    {r.pgName} · {r.bedCode}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {paiseToInr(Number(r.collectedPaise))}
                  </TD>
                  <TD className="text-right tabular-nums text-rose-700">
                    {paiseToInr(Number(r.deductedPaise))}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {paiseToInr(Number(r.refundedPaise))}
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {paiseToInr(Number(r.refundableBalancePaise))}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/admin/deposits/${r.bookingId}`}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Open →
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border p-3 ' +
        (accent ? 'border-rose-200 bg-rose-50' : 'border-zinc-200 bg-white')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
