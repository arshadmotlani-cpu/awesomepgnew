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

export default async function ElectricityBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const { id } = await params;
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
              ? 'Retry this page. If it still fails, re-open the bill from Billing Centre.'
              : 'Return to Billing Centre and select a different bill.')}
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
            href="/admin/billing?tab=electricity"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            Back to billing
          </Link>
        </div>
      </div>
    );
  }

  const {
    operator,
    audit,
    breakdown,
    ledger,
    distribution,
    paymentHistory,
    navigation,
    roomId,
    billingMonth,
    domainWarnings,
  } = result.bundle;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          {
            label: `Room ${operator?.roomNumber ?? '—'} · ${formatDate(billingMonth)}`,
          },
        ]}
      />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Room electricity</h1>
          <p className="text-sm text-apg-silver">
            {result.bundle.pgName} · Room {operator?.roomNumber ?? '—'} · {formatDate(billingMonth)}
          </p>
        </div>
        {roomId ? (
          <Link
            href={`/admin/electricity/ledger?roomId=${roomId}&month=${billingMonth.slice(0, 7)}`}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Settlement ledger →
          </Link>
        ) : null}
      </header>

      {domainWarnings.length > 0 ? (
        <div className="mb-6 space-y-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-50">
          <p className="font-medium text-white">Partial electricity explanation</p>
          {domainWarnings.map((warning) => (
            <div key={warning.code} className="space-y-1 border-t border-amber-400/15 pt-2 first:border-0 first:pt-0">
              <p>
                <span className="font-medium text-white">What happened: </span>
                {warning.message}
              </p>
              <p className="text-apg-silver">
                <span className="font-medium text-white">What you can do: </span>
                {warning.code === 'missing_breakdown'
                  ? 'Invoice amounts below remain authoritative. Re-open from Billing Centre after the next successful generate, or contact engineering if this bill is recent.'
                  : warning.code === 'missing_ledger'
                    ? 'Use invoice distribution below; ledger can be refreshed from Settlement ledger.'
                    : 'Retry this page. If the warning persists, return to Billing Centre.'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {operator ? (
        <RoomElectricityOperatorDashboardClient
          operator={operator}
          navigation={navigation}
          billingMonth={billingMonth}
        />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-apg-silver">
          Operator dashboard requires a complete calculation breakdown. Invoice distribution below is
          still authoritative.
        </div>
      )}

      <details className="mt-8 rounded-3xl bg-[#1A1F27]/80 ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium uppercase tracking-wider text-apg-silver hover:text-white">
          Advanced details — audit, ledger, exports
        </summary>
        <div className="space-y-6 border-t border-white/[0.06] p-6">
          {audit ? (
            <RoomElectricityAuditPanelClient
              billId={id}
              audit={audit}
              paymentHistory={paymentHistory}
              navigation={{ siblingBills: [], sameRoomOtherMonths: [] }}
              billingMonth={billingMonth}
            />
          ) : null}

          {ledger ? (
            <ElectricitySettlementLedgerPanel ledger={ledger} showManualCreditForm />
          ) : null}

          {breakdown ? (
            <ElectricityBillCalculationBreakdownPanel breakdown={breakdown} theme="dark" />
          ) : null}

          {distribution.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">
                Invoice distribution
              </h2>
              <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
                {distribution.map((row) => (
                  <li
                    key={row.invoiceId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-white"
                  >
                    <span>
                      {row.customerFullName} · {row.bedCode} · {row.invoiceNumber}
                    </span>
                    <span className="text-apg-silver">
                      {paiseToInr(row.amountPaise)} · {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </details>
    </>
  );
}
