import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ElectricitySettlementLedgerPanel } from '@/src/components/admin/electricity/ElectricitySettlementLedgerPanel';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { getElectricityBillDetail } from '@/src/db/queries/admin';
import { db } from '@/src/db/client';
import { electricityBills } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

export const dynamic = 'force-dynamic';

export default async function ElectricityBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const { id } = await params;
  const detail = await getElectricityBillDetail(id);

  if (!detail.ok || !detail.data?.bill) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
        Electricity bill not found.
        <Link href="/admin/billing?tab=electricity" className="ml-2 underline">
          Back to billing
        </Link>
      </div>
    );
  }

  const bill = detail.data.bill;
  const [billRow] = await db
    .select({ roomId: electricityBills.roomId })
    .from(electricityBills)
    .where(eq(electricityBills.id, id))
    .limit(1);

  const ledger = billRow?.roomId
    ? await getElectricitySettlementLedgerView({
        roomId: billRow.roomId,
        billingMonth: bill.billingMonth,
        fallbackTotalBillPaise: bill.totalPaise,
      })
    : null;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: `Room ${bill.roomNumber} · ${formatDate(bill.billingMonth)}` },
        ]}
      />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Room electricity bill</h1>
          <p className="text-sm text-apg-silver">
            {bill.pgName} · Room {bill.roomNumber} · {formatDate(bill.billingMonth)}
          </p>
        </div>
        {billRow?.roomId ? (
          <Link
            href={`/admin/electricity/ledger?roomId=${billRow.roomId}&month=${bill.billingMonth.slice(0, 7)}`}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Full settlement ledger →
          </Link>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-[#1A1F27]/80 p-6 ring-1 ring-white/[0.06]">
          <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">Meter bill</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Units consumed</dt>
              <dd className="font-medium text-white">{bill.unitsConsumed}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Rate per unit</dt>
              <dd className="font-medium text-white">{paiseToInr(bill.ratePerUnitPaise)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Monthly residents billed</dt>
              <dd className="font-medium text-white">{bill.monthlyOccupantCount}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
              <dt className="text-apg-silver">Total room bill</dt>
              <dd className="font-medium text-white">{paiseToInr(bill.totalPaise)}</dd>
            </div>
          </dl>
        </section>

        {ledger ? (
          <div className="rounded-3xl bg-[#1A1F27]/80 p-6 ring-1 ring-white/[0.06]">
            <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">
              Settlement summary
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Checkout credits</dt>
                <dd className="font-medium text-white">
                  −{paiseToInr(ledger.checkoutSettlementTotalPaise)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Manual credits</dt>
                <dd className="font-medium text-white">
                  −{paiseToInr(ledger.manualCreditsTotalPaise)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Remaining balance</dt>
                <dd className="text-lg font-semibold text-[#FF5A1F]">
                  {paiseToInr(ledger.remainingRoomBalancePaise)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
                <dt className="text-apg-silver">Reconciliation</dt>
                <dd className={ledger.isBalanced ? 'text-emerald-300' : 'text-amber-300'}>
                  {ledger.isBalanced ? 'Balanced ✓' : `Gap ${paiseToInr(ledger.reconciliationGapPaise)}`}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      {ledger ? (
        <div className="mt-6">
          <ElectricitySettlementLedgerPanel ledger={ledger} showManualCreditForm />
        </div>
      ) : null}
    </>
  );
}
