import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ElectricityBillReconciliationPanel } from '@/src/components/admin/electricity/ElectricityBillReconciliationPanel';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { getElectricityBillDetail } from '@/src/db/queries/admin';
import { db } from '@/src/db/client';
import { electricityBills } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { listCheckoutElectricityLedgerForBill } from '@/src/services/electricitySettlementLedger';

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
    .select({ checkoutCreditAppliedPaise: electricityBills.checkoutCreditAppliedPaise })
    .from(electricityBills)
    .where(eq(electricityBills.id, id))
    .limit(1);

  const ledgerEntries = await listCheckoutElectricityLedgerForBill(id);
  const checkoutCollectedPaise = billRow?.checkoutCreditAppliedPaise ?? 0;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: `Room ${bill.roomNumber} · ${formatDate(bill.billingMonth)}` },
        ]}
      />

      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold text-white">Room electricity bill</h1>
        <p className="text-sm text-apg-silver">
          {bill.pgName} · Room {bill.roomNumber} · {formatDate(bill.billingMonth)}
        </p>
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
              <dt className="text-apg-silver">Per resident</dt>
              <dd className="font-medium text-white">{paiseToInr(bill.perResidentPaise)}</dd>
            </div>
          </dl>
        </section>

        <ElectricityBillReconciliationPanel
          actualBillPaise={bill.totalPaise}
          checkoutCollectedPaise={checkoutCollectedPaise}
          remainingToRecoverPaise={Math.max(0, bill.totalPaise - checkoutCollectedPaise)}
          entries={ledgerEntries}
        />
      </div>

      {detail.data.distribution.length > 0 ? (
        <section className="mt-8 rounded-3xl bg-[#1A1F27]/80 p-6 ring-1 ring-white/[0.06]">
          <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">
            Resident invoices
          </h2>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {detail.data.distribution.map((row) => (
              <li key={row.invoiceId} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-white">{row.customerFullName}</p>
                  <p className="text-xs text-apg-silver">
                    {row.bedCode} · {row.invoiceNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-white">{paiseToInr(row.amountPaise)}</p>
                  <p className="text-xs text-apg-silver">{row.status}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
