import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { RecalculateFinancialForm } from './RecalculateFinancialForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function RecalculateFinancialPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  await requireAdminSession('/admin/system/recalculate-financial');

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Recalculate financial data' },
        ]}
      />
      <PageHeader
        title="Recalculate financial data"
        description="Emergency rebuild of SSOT aggregates and unified invoice alignment."
      />
      <div className="max-w-xl rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <RecalculateFinancialForm billingMonth={billingMonth} />
      </div>
      <p className="mt-4 text-xs text-apg-silver">
        After recalc, run{' '}
        <Link href="/admin/system/financial-audit" className="text-[#FF5A1F] hover:underline">
          Financial audit
        </Link>{' '}
        to verify all surfaces match the engine.
      </p>
    </>
  );
}
