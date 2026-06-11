import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconUsers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentsTable } from '@/src/components/admin/ResidentsTable';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage() {
  let residents;
  try {
    const session = await requireAdminPermission('bookings:write');
    residents = await listResidentsForAdmin(session);
  } catch (err) {
    return (
      <>
        <PageHeader title="Residents" />
        <DbStatusBanner error={err instanceof Error ? err.message : String(err)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone who signed up on the website. Search by name or phone, assign unassigned tenants to a bed, or manage active ones."
        actions={
          <Link
            href="/admin/bookings/new"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Assign tenant
          </Link>
        }
      />

      {residents.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No residents yet"
          description="Customers appear here when they sign up on the website or are assigned by admin."
        />
      ) : (
        <ResidentsTable residents={residents} />
      )}
    </>
  );
}
