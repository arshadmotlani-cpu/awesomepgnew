import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OccupancyDiagnosticsPanel } from '@/src/components/admin/OccupancyDiagnosticsPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SystemRepairPanel } from '@/src/components/admin/SystemRepairPanel';
import { ProductionFinancialResetPanel } from '@/src/components/admin/ProductionFinancialResetPanel';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function DeveloperModePage() {
  const session = await requireAdminSession('/admin/system/developer');
  if (session.role !== 'super_admin') {
    const { redirect } = await import('next/navigation');
    redirect('/admin/settings');
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Developer Mode' },
        ]}
      />
      <PageHeader
        title="Developer Mode"
        description="Repair tools, recalc, and diagnostics — not for day-to-day PG operations."
      />
      <p className="mb-6 text-xs text-apg-silver">
        <Link href="/admin/settings" className="text-[#FF5A1F] hover:underline">
          ← Back to settings
        </Link>
      </p>
      <div className="space-y-8">
        <SystemRepairPanel />
        <OccupancyDiagnosticsPanel />
        <ProductionFinancialResetPanel />
      </div>
    </>
  );
}
