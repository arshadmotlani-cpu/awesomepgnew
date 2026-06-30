import Link from 'next/link';
import { ElectricitySettlementLedgerPanel } from '@/src/components/admin/electricity/ElectricitySettlementLedgerPanel';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

export const dynamic = 'force-dynamic';

export default async function ElectricitySettlementLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string; month?: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);

  if (!sp.roomId) {
    return (
      <>
        <ModuleBreadcrumbs
          items={[
            { label: 'Billing', href: '/admin/billing?tab=electricity' },
            { label: 'Electricity settlement ledger' },
          ]}
        />
        <PageHeader
          title="Electricity settlement ledger"
          description="Open from a room electricity bill to view the full settlement ledger for that billing month."
        />
        <p className="mt-6 text-sm text-apg-silver">
          Provide <code className="text-white">?roomId=…&month=YYYY-MM</code> or open from a bill
          detail page.
        </p>
        <Link href="/admin/billing?tab=electricity" className="mt-4 inline-block text-[#FF5A1F] hover:underline">
          ← Back to electricity bills
        </Link>
      </>
    );
  }

  const ledger = await getElectricitySettlementLedgerView({
    roomId: sp.roomId,
    billingMonth,
  });

  if (!ledger) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
        No electricity data for this room and month.
      </div>
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: `Room ${ledger.roomNumber} · ${ledger.billingMonth.slice(0, 7)}` },
        ]}
      />
      <PageHeader
        title="Electricity settlement ledger"
        description="Room-level SSOT: credits, allocations, and reconciliation."
      />
      {ledger.electricityBillId ? (
        <Link
          href={`/admin/electricity/bills/${ledger.electricityBillId}`}
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          ← Room electricity bill
        </Link>
      ) : null}
      <div className="mt-6">
        <ElectricitySettlementLedgerPanel ledger={ledger} showManualCreditForm />
      </div>
    </>
  );
}
