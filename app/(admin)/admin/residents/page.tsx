import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconUsers } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentsTable } from '@/src/components/admin/ResidentsTable';
import { UnverifiedWebsiteSignupsTable } from '@/src/components/admin/UnverifiedWebsiteSignupsTable';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  listResidentsForAdmin,
  listUnverifiedWebsiteSignupsForAdmin,
} from '@/src/services/residentAdmin';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const sp = await searchParams;
  let residents;
  let unverifiedSignups;
  try {
    const session = await requireAdminPermission('bookings:write');
    [residents, unverifiedSignups] = await Promise.all([
      listResidentsForAdmin(session),
      listUnverifiedWebsiteSignupsForAdmin(session),
    ]);
  } catch (err) {
    return (
      <>
        <PageHeader title="Residents" />
        <DbStatusBanner error={err instanceof Error ? err.message : String(err)} />
      </>
    );
  }

  const unassignedCount = residents.filter((r) => r.tenancyStatus === 'unassigned').length;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label },
        ]}
      />
      <PageHeader
        title="Residents"
        description="Verified tenants only — KYC or payment approved. Assign beds here after verification."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/bookings/new"
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Assign tenant
            </Link>
            <Link
              href="/admin/beds"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-apg-silver hover:text-white"
            >
              Bed assignment
            </Link>
          </div>
        }
      />

      {unassignedCount > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong>{unassignedCount}</strong> resident{unassignedCount === 1 ? '' : 's'} need a bed
          assignment — click a row or use Assign tenant.
        </div>
      ) : null}

      {residents.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No verified residents yet"
          description="Approve KYC or a payment for website signups below — they move here once verified."
        />
      ) : (
        <ResidentsTable residents={residents} initialQuery={sp.search ?? ''} />
      )}

      <div className="mt-12">
        <UnverifiedWebsiteSignupsTable signups={unverifiedSignups} />
      </div>
    </>
  );
}
