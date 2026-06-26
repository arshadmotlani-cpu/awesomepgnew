import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconBuilding } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listPgs } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PgsPage() {
  const session = await requireAdminSession('/admin/pgs');
  const canWrite = adminHasPermission(session.role, 'pgs:write');
  const res = await listPgs();

  return (
    <>
      <PageHeader
        title="PG listings"
        description="Tap a card to open the bed map — whole-card navigation."
        actions={
          canWrite ? (
            <Link
              href="/admin/pgs/new"
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              + Add PG
            </Link>
          ) : null
        }
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title="No PGs yet"
          description="Create a listing or run npm run db:seed for demo data."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {res.data.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
            >
              <Link href={`/admin/pgs/${row.id}/map`} className="group block">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-white group-hover:text-[#FF5A1F]">
                    {row.name}
                  </h2>
                  <Badge tone={row.isActive ? 'emerald' : 'zinc'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-apg-silver">
                  {row.city}, {row.state} · {titleCase(row.genderPolicy.replace(/_/g, ' '))}
                </p>
                <p className="mt-3 text-xs font-medium text-[#FF5A1F]">Open bed map →</p>
              </Link>
              {canWrite ? (
                <Link
                  href={`/admin/pgs/${row.id}/listing`}
                  className="mt-3 inline-block text-xs text-apg-silver hover:text-white"
                >
                  Listing setup
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
