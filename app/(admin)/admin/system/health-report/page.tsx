import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { BrainIntegrityCards } from '@/src/components/admin/BrainIntegrityCards';
import { RepairIssueButton } from '@/src/components/admin/RepairIssueButton';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import type { HealthBrainName } from '@/src/lib/health/healthBrain';
import { runSystemHealthAudit } from '@/src/services/systemHealthAudit';
import {
  fingerprintForIssue,
  loadOpenDurableIssues,
  loadRecentRepairEvents,
} from '@/src/lib/health/repairEngine';
import { runAllSafeBrainRepairsAction } from '@/app/(admin)/admin/system/health-report/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const BRAINS: HealthBrainName[] = [
  'Resident',
  'Booking',
  'Finance',
  'Electricity',
  'Operations',
  'Health',
];

function isBrain(value: string | undefined): value is HealthBrainName {
  return !!value && (BRAINS as string[]).includes(value);
}

export default async function SystemHealthReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; brain?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const brainFilter = isBrain(sp.brain) ? sp.brain : null;
  const session = await requireAdminSession('/admin/system/health-report');
  const report = await runSystemHealthAudit(session, billingMonth);

  const liveIssues = brainFilter
    ? (report.brainIssues ?? []).filter((i) => i.brain === brainFilter)
    : report.brainIssues ?? [];

  const durable = await loadOpenDurableIssues({
    brain: brainFilter ?? undefined,
    limit: 100,
  }).catch(() => []);

  const historyByIssue = new Map<string, Awaited<ReturnType<typeof loadRecentRepairEvents>>>();
  for (const row of durable.slice(0, 15)) {
    historyByIssue.set(row.id, await loadRecentRepairEvents(row.id, 5).catch(() => []));
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'System health report' },
        ]}
      />
      <PageHeader
        title="Final system health report"
        description="Brain integrity command center — repair safe issues, escalate Owner Tasks."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.allPass ? 'emerald' : 'rose'}>
          {report.allPass ? 'ALL PASS — safe to deploy' : 'FAIL — do not deploy'}
        </Badge>
        <span className="text-xs text-apg-silver">
          Billing month {report.billingMonth} · As of{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(report.asOf),
          )}
        </span>
        {brainFilter ? (
          <Badge tone="amber">
            Filtered: {brainFilter} Brain{' '}
            <Link href={`/admin/system/health-report?month=${billingMonth}`} className="underline">
              clear
            </Link>
          </Badge>
        ) : null}
        <form action={runAllSafeBrainRepairsAction}>
          <button
            type="submit"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
          >
            Run all safe repairs
          </button>
        </form>
      </div>

      {report.brainCards ? (
        <div className="mb-8">
          <BrainIntegrityCards cards={report.brainCards} />
        </div>
      ) : null}

      <section className="mb-8 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <h2 className="text-sm font-semibold text-white">
          {brainFilter ? `${brainFilter} Brain issues` : 'Open Brain issues'}
        </h2>
        {liveIssues.length === 0 && durable.length === 0 ? (
          <p className="mt-2 text-xs text-apg-silver">No open issues for this filter.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(liveIssues.length > 0 ? liveIssues : durable.map((d) => ({
              id: d.fingerprint,
              severity: d.severity as 'P0' | 'P1' | 'P2',
              brain: d.brain as HealthBrainName,
              code: d.code,
              cause: d.cause,
              entityType: d.entityType,
              entityId: d.entityId,
              suggestedRepair: d.suggestedRepair,
              autoRepairAvailable: d.autoRepairable,
              status: d.status as 'open',
            }))).map((issue) => {
              const fp = fingerprintForIssue(issue);
              const durableRow = durable.find((d) => d.fingerprint === fp);
              const history = durableRow ? historyByIssue.get(durableRow.id) ?? [] : [];
              return (
                <li
                  key={issue.id}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/90"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-[#FF5A1F]">
                        [{issue.severity}] {issue.code}
                      </span>{' '}
                      <span className="text-apg-silver">· {issue.brain}</span>
                      <div className="mt-1">{issue.cause}</div>
                      <div className="mt-1 text-[10px] text-apg-silver">
                        {issue.entityType}:{issue.entityId ?? '—'} · {issue.suggestedRepair}
                        {durableRow ? ` · status=${durableRow.status}` : ''}
                      </div>
                    </div>
  // Prefer Owner Task badge with recommended action always visible
                    {issue.autoRepairAvailable ? (
                      <RepairIssueButton fingerprint={fp} />
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <Badge tone="amber">Owner Task</Badge>
                        <span className="max-w-[14rem] text-right text-[10px] text-amber-100/80">
                          {issue.suggestedRepair}
                        </span>
                      </div>
                    )}
                  </div>
                  {history.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-t border-white/5 pt-2 text-[10px] text-apg-silver">
                      {history.map((h) => (
                        <li key={h.id}>
                          {h.createdAt?.toISOString?.() ?? String(h.createdAt)} · {h.repairFn} ·{' '}
                          {h.result}
                          {h.error ? ` · ${h.error}` : ''}
                          {h.durationMs != null ? ` · ${h.durationMs}ms` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-4">
        {report.sections.map((section) => (
          <section
            key={section.name}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{section.name}</h2>
              <Badge tone={section.pass ? 'emerald' : 'rose'}>
                {section.pass ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-apg-silver">{section.summary}</p>
            {section.mismatches.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-rose-400/20 bg-rose-500/5 p-3">
                {section.mismatches.map((m, i) => (
                  <li key={i} className="text-xs text-rose-200">
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
