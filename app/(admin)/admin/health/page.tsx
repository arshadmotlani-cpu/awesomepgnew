import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { runAdminSmokeChecks } from '@/src/services/adminSmokeChecks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdminHealthPage() {
  const session = await requireAdminSession('/admin/health');
  const report = await runAdminSmokeChecks();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Health smoke checks' },
        ]}
      />
      <PageHeader
        title="Health smoke checks"
        description="Read-only deploy gate — booking integrity, vacating settlements, and cron freshness."
        actions={
          <Link
            href="/admin/system/health-report"
            className="text-xs font-medium text-[#FF5A1F] hover:underline"
          >
            Full system health report →
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.allPass ? 'emerald' : 'rose'}>
          {report.allPass ? 'ALL PASS' : 'FAIL — investigate before deploy'}
        </Badge>
        <span className="text-xs text-apg-silver">
          As of{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(report.asOf),
          )}
        </span>
      </div>

      <ul className="space-y-3">
        {report.checks.map((check) => (
          <li
            key={check.id}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{check.label}</h2>
              <Badge tone={check.pass ? 'emerald' : 'rose'}>{check.pass ? 'PASS' : 'FAIL'}</Badge>
            </div>
            <p className="mt-2 text-xs text-apg-silver">{check.detail}</p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-apg-silver">
        JSON API:{' '}
        <code className="rounded bg-white/5 px-1.5 py-0.5">GET /api/admin/smoke-checks</code>
        {' · '}
        Signed in as {session.email}
      </p>
    </>
  );
}
