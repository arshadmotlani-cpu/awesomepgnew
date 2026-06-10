import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { IconDatabase } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { StatCard } from '@/src/components/admin/StatCard';
import { checkMigrationHealth } from '@/src/db/migrationHealth';

export const dynamic = 'force-dynamic';

export default async function AdminSystemPage() {
  const health = await checkMigrationHealth();

  return (
    <>
      <PageHeader
        title="System status"
        description="Database migration health — compare the running schema with the codebase."
      />

      {!health.ok ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Migrations are pending or could not be verified.</p>
          <p className="mt-1">
            Run <code className="rounded bg-rose-100 px-1">npm run db:migrate</code> before
            using booking, auth, or KYC features.
          </p>
          {health.error ? <p className="mt-2 text-rose-800">{health.error}</p> : null}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Database schema matches the codebase.</p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Current DB version"
          value={health.currentDbVersion ?? '—'}
          icon={<IconDatabase />}
        />
        <StatCard
          label="Latest code version"
          value={health.latestCodeVersion ?? '—'}
          icon={<IconDatabase />}
        />
        <StatCard
          label="Pending migrations"
          value={String(health.pendingCount)}
          icon={<IconDatabase />}
          accent={health.pendingCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <Card>
        <CardHeader
          title="Migration summary"
          description={`${health.appliedCount} applied · ${health.codeCount} in repository`}
          actions={
            <Badge tone={health.ok ? 'emerald' : 'rose'}>
              {health.ok ? 'Up to date' : 'Action required'}
            </Badge>
          }
        />
        <CardBody className="space-y-4 text-sm text-zinc-700">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Applied count</dt>
              <dd className="mt-0.5 font-mono text-zinc-900">{health.appliedCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Repository count</dt>
              <dd className="mt-0.5 font-mono text-zinc-900">{health.codeCount}</dd>
            </div>
          </dl>

          {health.pending.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Pending migrations
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-rose-800">
                {health.pending.map((tag) => (
                  <li key={tag}>• {tag}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-zinc-500">No pending migrations.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
