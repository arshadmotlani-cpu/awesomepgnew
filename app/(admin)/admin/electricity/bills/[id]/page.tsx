import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ElectricityBillCalculationBreakdownPanel } from '@/src/components/billing/ElectricityBillCalculationBreakdownPanel';
import { ElectricitySettlementLedgerPanel } from '@/src/components/admin/electricity/ElectricitySettlementLedgerPanel';
import { RoomElectricityAuditPanelClient } from '@/src/components/admin/electricity/RoomElectricityAuditPanelClient';
import { RoomElectricityOperatorDashboardClient } from '@/src/components/admin/electricity/RoomElectricityOperatorDashboardClient';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { loadRoomElectricityAuditBundle } from '@/src/services/roomElectricityAuditBundle';

export const dynamic = 'force-dynamic';

export default async function ElectricityBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const { id } = await params;
  const bundle = await loadRoomElectricityAuditBundle(id);

  if (!bundle) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
        Electricity bill not found.
        <Link href="/admin/billing?tab=electricity" className="ml-2 underline">
          Back to billing
        </Link>
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
  } = bundle;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          {
            label: `Room ${operator.roomNumber} · ${formatDate(billingMonth)}`,
          },
        ]}
      />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Room electricity</h1>
          <p className="text-sm text-apg-silver">
            {operator.pgName} · Room {operator.roomNumber} · {formatDate(billingMonth)}
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

      <RoomElectricityOperatorDashboardClient
        operator={operator}
        navigation={navigation}
        billingMonth={billingMonth}
      />

      <details className="mt-8 rounded-3xl bg-[#1A1F27]/80 ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium uppercase tracking-wider text-apg-silver hover:text-white">
          Advanced details — audit, ledger, exports
        </summary>
        <div className="space-y-6 border-t border-white/[0.06] p-6">
          <RoomElectricityAuditPanelClient
            billId={id}
            audit={audit}
            paymentHistory={paymentHistory}
            navigation={{ siblingBills: [], sameRoomOtherMonths: [] }}
            billingMonth={billingMonth}
          />

          {ledger ? (
            <ElectricitySettlementLedgerPanel ledger={ledger} showManualCreditForm />
          ) : null}

          {breakdown ? (
            <ElectricityBillCalculationBreakdownPanel breakdown={breakdown} theme="dark" />
          ) : null}

          {distribution.length > 0 ? (
            <section className="rounded-2xl bg-[#12161C]/60 p-5 ring-1 ring-white/[0.04]">
              <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">
                Resident invoices
              </h2>
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {distribution.map((row) => (
                  <li
                    key={row.invoiceId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-white">{row.customerFullName}</p>
                      <p className="text-xs text-apg-silver">
                        {row.invoiceNumber} · {row.bedCode} · {row.status}
                      </p>
                    </div>
                    <p className="font-semibold text-white">{paiseToInr(row.amountPaise)}</p>
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
