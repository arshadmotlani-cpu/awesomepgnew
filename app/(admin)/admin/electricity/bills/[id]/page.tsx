import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ElectricityBillCalculationBreakdownPanel } from '@/src/components/billing/ElectricityBillCalculationBreakdownPanel';
import { ElectricitySettlementLedgerPanel } from '@/src/components/admin/electricity/ElectricitySettlementLedgerPanel';
import { RoomElectricityAuditPanelClient } from '@/src/components/admin/electricity/RoomElectricityAuditPanelClient';
import { RoomElectricityOperatorDashboardClient } from '@/src/components/admin/electricity/RoomElectricityOperatorDashboardClient';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { loadRoomElectricityAuditBundleResult } from '@/src/services/roomElectricityAuditBundle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function rateLabel(ratePerUnitPaise: number): string {
  const rupees = ratePerUnitPaise / 100;
  const formatted = Number.isInteger(rupees)
    ? rupees.toLocaleString('en-IN')
    : rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `₹${formatted}/unit`;
}

export default async function ElectricityBillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; pgId?: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const { id } = await params;
  const sp = await searchParams;
  const result = await loadRoomElectricityAuditBundleResult(id);

  if (!result.ok) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-50">
        <h1 className="text-xl font-semibold text-white">Electricity bill details unavailable</h1>
        <p className="text-sm text-apg-silver">
          <span className="font-medium text-white">What happened: </span>
          {result.message}
        </p>
        <p className="text-sm text-apg-silver">
          <span className="font-medium text-white">Why: </span>
          {result.code === 'not_found'
            ? 'No electricity bill exists for this id.'
            : result.code === 'missing_breakdown'
              ? 'The bill was saved without a calculation explanation artifact.'
              : result.code === 'incomplete_generation'
                ? 'Generation stopped before all financial artifacts were written.'
                : result.code === 'missing_room'
                  ? 'The room linked to this bill is missing.'
                  : 'An unexpected error occurred while assembling the audit view.'}
        </p>
        <p className="text-sm text-apg-silver">
          <span className="font-medium text-white">What you can do: </span>
          {result.operatorHint ??
            (result.recoverable
              ? 'Retry this page. If it still fails, re-open the bill from Electricity Billing.'
              : 'Return to Electricity Billing and select a different bill.')}
        </p>
        <p className="text-xs text-apg-silver/80">Code: {result.code}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          {result.recoverable ? (
            <Link
              href={`/admin/electricity/bills/${id}`}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
            >
              Retry
            </Link>
          ) : null}
          <Link
            href="/admin/billing/electricity/generate"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            ← Back to Electricity Billing
          </Link>
        </div>
      </div>
    );
  }

  const {
    billSummary,
    operator,
    audit,
    breakdown,
    ledger,
    distribution,
    paymentHistory,
    navigation,
    roomId,
    pgId,
    billingMonth,
    domainWarnings,
    pgName,
  } = result.bundle;

  const monthParam = (sp.month ?? billingMonth).slice(0, 7);
  const backPgId = sp.pgId ?? pgId;
  const backHref = `/admin/billing/electricity/generate?month=${encodeURIComponent(monthParam)}&pgId=${encodeURIComponent(backPgId)}`;
  const missingBreakdown = domainWarnings.some((w) => w.code === 'missing_breakdown');

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: 'Electricity billing', href: backHref },
          {
            label: `Room ${billSummary.roomNumber} · ${formatDate(billingMonth)}`,
          },
        ]}
      />

      <Link href={backHref} className="mb-4 inline-block text-xs font-medium text-[#FF5A1F] hover:underline">
        ← Back to Electricity Billing
      </Link>

      <header className="mb-6 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-apg-silver">
          Electricity bill
        </p>
        <h1 className="text-2xl font-semibold text-white">Room {billSummary.roomNumber}</h1>
        <p className="text-sm text-apg-silver">{pgName}</p>
        <p className="text-sm text-white">{formatDate(billingMonth)}</p>
        <p className="text-sm text-apg-silver">
          Status:{' '}
          <span className="font-medium text-white">{billSummary.paymentStatus}</span>
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
          Meter
        </h2>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Previous reading</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {billSummary.previousReadingUnits.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Current reading</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {billSummary.currentReadingUnits.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Units consumed</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {billSummary.unitsConsumed.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Rate</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {rateLabel(billSummary.ratePerUnitPaise)}
          </p>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-[#12161C] p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
          Electricity charge
        </h2>
        <div className="mt-3 flex items-center justify-between text-sm text-white">
          <span>Room total</span>
          <span className="font-medium">{paiseToInr(billSummary.totalPaise)}</span>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-[#12161C] p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
          Resident allocation
        </h2>
        {distribution.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/10">
            {distribution.map((row) => (
              <li
                key={row.invoiceId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-white"
              >
                <span>
                  {row.customerFullName}
                  {row.bedCode && row.bedCode !== '—' ? (
                    <span className="text-apg-silver"> · {row.bedCode}</span>
                  ) : null}
                </span>
                <span className="text-apg-silver">
                  {paiseToInr(row.amountPaise)}
                  <span className="ml-2 text-[11px] uppercase tracking-wide">{row.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : breakdown?.timeline && breakdown.timeline.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/10">
            {breakdown.timeline.map((entry) => {
              const amountPaise =
                entry.monthlyInvoiceAmountPaise > 0
                  ? entry.monthlyInvoiceAmountPaise
                  : entry.calculatedSharePaise;
              return (
                <li
                  key={entry.bookingId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-white"
                >
                  <span>{entry.customerName}</span>
                  <span className="text-apg-silver">{paiseToInr(amountPaise)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-apg-silver">No resident allocation recorded on this bill.</p>
        )}
      </section>

      <section className="mb-6 grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-4 sm:grid-cols-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
            Due date
          </h2>
          <p className="mt-2 text-sm font-medium text-white">
            {billSummary.dueDate ? formatDate(billSummary.dueDate) : '—'}
          </p>
        </div>
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
            Late fee
          </h2>
          <p className="mt-2 text-sm font-medium text-white">{paiseToInr(0)}</p>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-white/10 bg-[#12161C] p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
          Calculation breakdown
        </h2>
        {breakdown ? (
          <div className="mt-3">
            <ElectricityBillCalculationBreakdownPanel breakdown={breakdown} theme="dark" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-apg-silver">
            {missingBreakdown
              ? 'Detailed calculation breakdown was not stored for this historical bill.'
              : 'Calculation breakdown unavailable for this historical bill.'}
          </p>
        )}
      </section>

      {domainWarnings.length > 0 ? (
        <div className="mb-6 space-y-2 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs text-apg-silver">
          {domainWarnings
            .filter((w) => w.code !== 'missing_breakdown')
            .map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
        </div>
      ) : null}

      {operator ? (
        <details className="mt-4 rounded-3xl bg-[#1A1F27]/80 ring-1 ring-white/[0.06]">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium uppercase tracking-wider text-apg-silver hover:text-white">
            Operator dashboard
          </summary>
          <div className="border-t border-white/[0.06] p-6">
            <RoomElectricityOperatorDashboardClient
              operator={operator}
              navigation={navigation}
              billingMonth={billingMonth}
            />
          </div>
        </details>
      ) : null}

      <details className="mt-4 rounded-3xl bg-[#1A1F27]/80 ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium uppercase tracking-wider text-apg-silver hover:text-white">
          Advanced details — audit, ledger, exports
        </summary>
        <div className="space-y-6 border-t border-white/[0.06] p-6">
          {roomId ? (
            <Link
              href={`/admin/electricity/ledger?roomId=${roomId}&month=${billingMonth.slice(0, 7)}`}
              className="inline-block text-sm font-medium text-[#FF5A1F] hover:underline"
            >
              Settlement ledger →
            </Link>
          ) : null}

          {audit ? (
            <RoomElectricityAuditPanelClient
              billId={id}
              audit={audit}
              paymentHistory={paymentHistory}
              navigation={{ siblingBills: [], sameRoomOtherMonths: [] }}
              billingMonth={billingMonth}
            />
          ) : null}

          {ledger ? <ElectricitySettlementLedgerPanel ledger={ledger} showManualCreditForm /> : null}
        </div>
      </details>
    </>
  );
}
