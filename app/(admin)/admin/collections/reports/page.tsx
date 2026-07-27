import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { isCollectionsV1Enabled } from '@/src/lib/collections/featureFlag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Phase 3 reports stub — full KPIs land with collectionsReports. */
export default async function CollectionsReportsStubPage() {
  if (!isCollectionsV1Enabled()) redirect('/admin/billing');
  const session = await requireAdminSession('/admin/collections/reports');
  if (!adminHasPermission(session.role, 'collections:read')) {
    redirect('/admin/overview');
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Admin', href: '/admin/overview' },
          { label: 'Collections', href: '/admin/collections' },
          { label: 'Reports' },
        ]}
      />
      <DbStatusBanner />
      <PageHeader
        title="Collection reports"
        description="Efficiency and windowed totals will appear here in Phase 3. Use the dashboard KPIs for daily work."
        actions={
          <Link
            href="/admin/collections"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-white hover:bg-white/5"
          >
            Back to Collections
          </Link>
        }
      />
      <div className="mt-8 rounded-xl border border-dashed border-white/20 bg-[#1A1F27] p-8 text-center text-sm text-apg-silver">
        Reports service ships in Phase 3.4 — Expected / Collected / Outstanding / Overdue from RFE only.
      </div>
    </>
  );
}
