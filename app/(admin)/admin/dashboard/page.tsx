import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listPgs } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminDashboardControlPage() {
  const session = await requireAdminSession('/admin/dashboard');
  const canWritePgs = adminHasPermission(session.role, 'pgs:write');
  const pgs = await listPgs();

  if (!canWritePgs) {
    redirect('/admin');
  }

  return (
    <>
      <PageHeader
        title="PG control panel"
        description="Full CRUD over listings, images, features, and availability."
        actions={
          <Link
            href="/admin/pgs/new"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,90,31,0.3)] hover:brightness-110"
          >
            + Add PG
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Total PGs</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">
              {pgs.ok ? pgs.data.length : '—'}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Active listings</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {pgs.ok ? pgs.data.filter((p) => p.isActive).length : '—'}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Public /pgs</p>
            <Link href="/pgs" target="_blank" className="mt-1 inline-block text-sm text-[#FF5A1F] hover:underline">
              Open browse page →
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="All PG listings" description="Click a row to edit" />
        <CardBody className="divide-y divide-zinc-100 p-0">
          {!pgs.ok ? (
            <p className="p-4 text-sm text-rose-600">{pgs.error}</p>
          ) : pgs.data.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">
              No PGs yet.{' '}
              <Link href="/admin/pgs/new" className="text-[#FF5A1F] hover:underline">
                Create your first listing
              </Link>{' '}
              or run <code className="rounded bg-zinc-100 px-1">npm run db:seed</code>.
            </p>
          ) : (
            pgs.data.map((row) => (
              <Link
                key={row.id}
                href={`/admin/pgs/${row.id}/edit`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-900">{row.name}</p>
                  <p className="text-xs text-zinc-500">
                    {row.city}, {row.state} · {row.slug}
                  </p>
                </div>
                <Badge tone={row.isActive ? 'emerald' : 'zinc'}>
                  {row.isActive ? 'Live' : 'Hidden'}
                </Badge>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
