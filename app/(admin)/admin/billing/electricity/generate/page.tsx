import Link from 'next/link';
import { ElectricityDuplicateWarningBanner } from '@/src/components/admin/electricity/ElectricityDuplicateWarningBanner';
import { PgElectricityBillingChecklistClient } from '@/src/components/admin/electricity/PgElectricityBillingChecklist';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  listActivePgsForElectricityBilling,
  loadPgElectricityBillingChecklist,
} from '@/src/lib/billing/pgElectricityBillingChecklist';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BillingElectricityGeneratePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    pgId?: string;
  }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const pgs = await listActivePgsForElectricityBilling();
  const selectedPgId = sp.pgId && pgs.some((p) => p.id === sp.pgId) ? sp.pgId : null;
  const checklist = selectedPgId
    ? await loadPgElectricityBillingChecklist({
        pgId: selectedPgId,
        billingMonth,
      })
    : null;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing Center', href: moduleHref('billing') },
          { label: 'Electricity billing' },
        ]}
      />
      <PageHeader
        title="Electricity billing"
        description="One PG at a time — previous readings load automatically; enter current readings and generate."
      />
      <div className="mt-4">
        <ElectricityDuplicateWarningBanner />
      </div>
      <Link
        href={`/admin/billing?tab=electricity&month=${billingMonth.slice(0, 7)}`}
        className="text-xs font-medium text-[#FF5A1F] hover:underline"
      >
        ← Back to Billing Center
      </Link>

      <PgElectricityBillingChecklistClient
        billingMonth={billingMonth}
        pgs={pgs}
        selectedPgId={selectedPgId}
        checklist={checklist}
      />
    </>
  );
}
