import Link from 'next/link';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { HealthDashboard } from '@/src/components/admin/HealthDashboard';
import { IconDatabase } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { MonitoringDashboard } from '@/src/components/admin/MonitoringDashboard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SystemHealthCard } from '@/src/components/admin/SystemHealthCard';
import { checkMigrationHealth } from '@/src/db/migrationHealth';
import { getErrorsByRoute, getMonitoringSnapshot } from '@/src/db/queries/monitoring';
import { getEnvHealthSummary } from '@/src/lib/healing/envHealer';
import { getLatestPersistedHealth, runHealthDiagnosis } from '@/src/lib/healing/healthEngine';
import { getIntegrationsHealthSummaryWithBlobProbe } from '@/src/lib/integrations/status';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { loadOverviewContext } from '@/src/services/overviewData';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function SystemHealthModulePage() {
  const session = await requireAdminSession('/admin/system');
  const ctx = await loadOverviewContext(session, undefined, { syncActions: false });
  const migration = await checkMigrationHealth();

  let healthInitial = null;
  let healthError: string | null = null;
  try {
    const state = await runHealthDiagnosis();
    const persisted = await getLatestPersistedHealth();
    const envBase = getEnvHealthSummary();
    const integrations = await getIntegrationsHealthSummaryWithBlobProbe();
    healthInitial = {
      ...state,
      env: { ...envBase, integrations },
      persisted: persisted
        ? {
            status: persisted.status,
            dbStatus: persisted.dbStatus,
            envStatus: persisted.envStatus,
            lastError: persisted.lastError,
            updatedAt: persisted.updatedAt.toISOString(),
          }
        : null,
    };
  } catch (error) {
    healthError = error instanceof Error ? error.message : String(error);
  }

  const [monitoring, errorsByRoute] = await Promise.all([
    getMonitoringSnapshot({ limit: 50 }).catch(() => null),
    getErrorsByRoute(7, 20).catch(() => []),
  ]);

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="System health" />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label },
        ]}
      />
      <PageHeader
        title="System health"
        description="Sentry errors, logs, uptime, failed requests, and schema diagnostics."
      />

      <div className="space-y-8">
        <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Financial SSOT tools</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Audit and emergency recalc for the Resident Financial Engine.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/system/financial-audit"
              className="rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-4 py-2 text-sm font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/20"
            >
              Financial audit →
            </Link>
            <Link
              href="/admin/system/recalculate-financial"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              Recalculate financial data →
            </Link>
            <Link
              href="/admin/system/bed-audit"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              Bed audit →
            </Link>
            <Link
              href="/admin/system/pricing-health"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              Pricing health report →
            </Link>
            <Link
              href="/admin/system/health-report"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              System health report →
            </Link>
            <Link
              href="/admin/uploads"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
            >
              Recent resident uploads →
            </Link>
            <Link
              href="/admin/residents/timeline"
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20"
            >
              Resident timeline →
            </Link>
          </div>
        </section>

        <AdminSectionErrorBoundary title="Uptime & errors">
          <SystemHealthCard health={ctx.data.systemHealth} sentryUrl={ctx.data.sentryUrl} />
        </AdminSectionErrorBoundary>

        {errorsByRoute.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Errors by route (7 days)</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Route</TH>
                    <TH className="text-right">Count</TH>
                    <TH>Last seen</TH>
                  </TR>
                </THead>
                <TBody>
                  {errorsByRoute.map((row) => (
                    <TR key={row.route}>
                      <TD className="font-mono text-xs text-white">{row.route}</TD>
                      <TD className="text-right tabular-nums">{row.count}</TD>
                      <TD className="text-xs text-apg-silver">
                        {new Intl.DateTimeFormat('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(row.lastSeen))}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </section>
        ) : null}

        <AdminSectionErrorBoundary title="Request monitoring">
          <MonitoringDashboard initial={monitoring} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Diagnostics">
          <HealthDashboard initial={healthInitial} initialError={healthError} />
        </AdminSectionErrorBoundary>

        <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <div className="flex items-center gap-2">
            <IconDatabase className="text-apg-silver" width={20} height={20} />
            <h2 className="text-sm font-semibold text-white">Database migrations</h2>
            <Badge tone={migration.ok ? 'emerald' : 'rose'}>{migration.ok ? 'OK' : 'Pending'}</Badge>
          </div>
          <p className="mt-2 text-xs text-apg-silver">
            Current version: {migration.currentDbVersion ?? '—'} · Expected:{' '}
            {migration.latestCodeVersion ?? '—'}
          </p>
          {!migration.ok && migration.error ? (
            <p className="mt-2 text-xs text-rose-300">{migration.error}</p>
          ) : null}
        </section>
      </div>
    </>
  );
}
