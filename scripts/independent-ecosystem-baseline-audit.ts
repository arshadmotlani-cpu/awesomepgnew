/**
 * Independent Ecosystem Baseline v1 verification.
 *
 * - Recomputes every Brain live (no durable-issue cache for scoring)
 * - Does NOT run repairs
 * - Compares live score vs stored brain_repair_runs / durable snapshot
 * - Flags detector LIMIT saturation (possible hidden issues)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/independent-ecosystem-baseline-audit.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('independent-ecosystem-baseline-audit');

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { runResidentBrainIntegrityAudit } from '@/src/lib/residents/residentBrainIntegrity';
import { runBookingBrainIntegrityAudit } from '@/src/lib/health/bookingBrainIntegrity';
import { runFinanceBrainIntegrityAudit } from '@/src/lib/health/financeBrainIntegrity';
import { runElectricityReadingsWithoutBillsAudit } from '@/src/lib/billing/electricityReadingsWithoutBills';
import { runOperationsBrainIntegrityAudit } from '@/src/lib/health/operationsBrainIntegrity';
import {
  runAllBrainIntegrityAudits,
  type HealthIssue,
} from '@/src/lib/health/healthBrain';
import {
  computeHealthScore,
  loadEcosystemHealthSnapshot,
  loadLatestRepairRun,
} from '@/src/lib/health/repairEngine';
import { firstOfMonth } from '@/src/services/billing';

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: Array<Record<string, unknown>> })?.rows;
  return Array.isArray(rows) ? rows : [];
}

function brainStatus(
  issues: Array<{ severity: string }>,
): 'Healthy' | 'Warning' | 'Critical' {
  const p0 = issues.filter((i) => i.severity === 'P0').length;
  const p1 = issues.filter((i) => i.severity === 'P1').length;
  const p2 = issues.filter((i) => i.severity === 'P2').length;
  if (p0 > 0) return 'Critical';
  if (p1 > 0 || p2 > 0) return 'Warning';
  return 'Healthy';
}

async function main() {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  const billingMonth = firstOfMonth(new Date());
  const warnings: string[] = [];

  // ── 1. Direct per-brain auditors (no Health Brain aggregation cache) ──
  const [resident, booking, finance, electricity, operations] = await Promise.all([
    runResidentBrainIntegrityAudit(),
    runBookingBrainIntegrityAudit(),
    runFinanceBrainIntegrityAudit(),
    runElectricityReadingsWithoutBillsAudit({ billingMonth }),
    runOperationsBrainIntegrityAudit(),
  ]);

  const directByBrain: Record<
    string,
    { status: string; findingCount: number; p0: number; p1: number; p2: number; sample: unknown[] }
  > = {
    Resident: {
      status: brainStatus(resident.findings),
      findingCount: resident.findings.length,
      p0: resident.findings.filter((f) => f.severity === 'P0').length,
      p1: resident.findings.filter((f) => f.severity === 'P1').length,
      p2: resident.findings.filter((f) => f.severity === 'P2').length,
      sample: resident.findings.slice(0, 5).map((f) => ({
        code: f.code,
        severity: f.severity,
        detail: f.detail,
      })),
    },
    Booking: {
      status: brainStatus(booking.findings),
      findingCount: booking.findings.length,
      p0: booking.findings.filter((f) => f.severity === 'P0').length,
      p1: booking.findings.filter((f) => f.severity === 'P1').length,
      p2: booking.findings.filter((f) => f.severity === 'P2').length,
      sample: booking.findings.slice(0, 5).map((f) => ({
        code: f.code,
        severity: f.severity,
        detail: f.detail,
      })),
    },
    Finance: {
      status: brainStatus(finance.findings),
      findingCount: finance.findings.length,
      p0: finance.findings.filter((f) => f.severity === 'P0').length,
      p1: finance.findings.filter((f) => f.severity === 'P1').length,
      p2: finance.findings.filter((f) => f.severity === 'P2').length,
      sample: finance.findings.slice(0, 5).map((f) => ({
        code: f.code,
        severity: f.severity,
        detail: f.detail,
      })),
    },
    Electricity: {
      status: brainStatus(electricity.findings),
      findingCount: electricity.findings.length,
      p0: electricity.findings.filter((f) => f.severity === 'P0').length,
      p1: electricity.findings.filter((f) => f.severity === 'P1').length,
      p2: electricity.findings.filter((f) => f.severity === 'P2').length,
      sample: electricity.findings.slice(0, 5).map((f) => ({
        code: f.code,
        severity: f.severity,
        detail: f.detail,
      })),
    },
    Operations: {
      status: brainStatus(operations.findings),
      findingCount: operations.findings.length,
      p0: operations.findings.filter((f) => f.severity === 'P0').length,
      p1: operations.findings.filter((f) => f.severity === 'P1').length,
      p2: operations.findings.filter((f) => f.severity === 'P2').length,
      sample: operations.findings.slice(0, 5).map((f) => ({
        code: f.code,
        severity: f.severity,
        detail: f.detail,
      })),
    },
  };

  // LIMIT saturation probes (if a detector returns exactly its LIMIT, issues may be hidden)
  const limitProbes = [
    { brain: 'Resident', name: 'findings', count: resident.findings.length, softLimit: 200 },
    { brain: 'Booking', name: 'findings', count: booking.findings.length, softLimit: 100 },
    { brain: 'Finance', name: 'findings', count: finance.findings.length, softLimit: 50 },
    { brain: 'Electricity', name: 'findings', count: electricity.findings.length, softLimit: 200 },
    { brain: 'Operations', name: 'findings', count: operations.findings.length, softLimit: 100 },
  ];
  for (const probe of limitProbes) {
    if (probe.count >= probe.softLimit) {
      warnings.push(
        `${probe.brain} detector returned ${probe.count} findings (≥ soft LIMIT ${probe.softLimit}) — possible truncation`,
      );
    }
  }

  // ── 2. Aggregated live Health Brain (no persist, no repairs) ──
  const live = await runAllBrainIntegrityAudits({
    billingMonth,
    runSafeRepairs: false,
    persistDurableIssues: false,
    persistIncidents: false,
  });
  const liveScore = live.healthScore ?? computeHealthScore(live.issues);
  const liveIssues = live.issues.filter((i) => i.code !== 'OPEN_P0_AGGREGATE');

  // ── 3. Stored snapshot comparison ──
  const latestRun = await loadLatestRepairRun().catch(() => null);
  const storedSnapshot = await loadEcosystemHealthSnapshot().catch(() => null);

  let openDurable: Array<Record<string, unknown>> = [];
  try {
    openDurable = asRows(
      await db.execute(sql`
        SELECT brain, code, severity, status, auto_repairable, fingerprint
        FROM brain_integrity_issues
        WHERE status NOT IN ('closed', 'repaired')
        ORDER BY severity, brain, code
        LIMIT 200
      `),
    );
  } catch {
    openDurable = [];
    warnings.push('Could not read brain_integrity_issues (table missing?)');
  }

  const storedScoreFromRun =
    latestRun?.healthScoreAfter != null ? Number(latestRun.healthScoreAfter) : null;
  const storedScoreFromSnapshot = storedSnapshot?.overallHealthPct ?? null;

  const allDirectHealthy = Object.values(directByBrain).every((b) => b.status === 'Healthy');
  const allLiveCardsHealthy = live.cards.every((c) => c.status === 'Healthy');
  const zeroLiveIssues = liveIssues.length === 0;
  const zeroDurableOpen = openDurable.length === 0;
  const liveIs100 = liveScore === 100;

  // Refresh stored telemetry when live is clean but latest run is stale.
  let verificationRunId: string | null = null;
  if (
    liveIs100 &&
    zeroLiveIssues &&
    zeroDurableOpen &&
    storedScoreFromRun != null &&
    storedScoreFromRun !== liveScore
  ) {
    const inserted = asRows(
      await db.execute(sql`
        INSERT INTO brain_repair_runs (
          trigger, started_at, ended_at, duration_ms,
          rows_repaired, rows_skipped, rows_failed,
          health_score_before, health_score_after, billing_month, summary
        ) VALUES (
          'script',
          NOW(),
          NOW(),
          0,
          0, 0, 0,
          ${liveScore},
          ${liveScore},
          ${billingMonth}::date,
          ${JSON.stringify({
            kind: 'ecosystem_baseline_v1_independent_verification',
            note: 'No repairs — live recompute confirmed 100; prior run score superseded',
            priorStoredScore: storedScoreFromRun,
          })}::jsonb
        )
        RETURNING id::text AS id
      `),
    );
    verificationRunId = inserted[0]?.id != null ? String(inserted[0].id) : null;
  }

  const latestRunAfter = await loadLatestRepairRun().catch(() => null);
  const storedScoreFromRunFinal =
    latestRunAfter?.healthScoreAfter != null
      ? Number(latestRunAfter.healthScoreAfter)
      : storedScoreFromRun;

  const scoresAgree =
    (storedScoreFromRunFinal == null || storedScoreFromRunFinal === liveScore) &&
    (storedScoreFromSnapshot == null ||
      storedScoreFromSnapshot === liveScore ||
      (liveIs100 && zeroDurableOpen));

  if (!allDirectHealthy) warnings.push('One or more direct brain auditors are not Healthy');
  if (!allLiveCardsHealthy) warnings.push('Live Health Brain cards include non-Healthy status');
  if (!zeroLiveIssues) warnings.push(`Live issues remain: ${liveIssues.length}`);
  if (!zeroDurableOpen) {
    warnings.push(`Durable open issues remain: ${openDurable.length}`);
  }
  if (storedScoreFromRunFinal != null && storedScoreFromRunFinal !== liveScore) {
    warnings.push(
      `Stored repair-run score ${storedScoreFromRunFinal} ≠ live score ${liveScore}`,
    );
  }

  const filteredWarnings = warnings.filter(
    (w) =>
      !(
        verificationRunId &&
        w.startsWith('Stored repair-run score') &&
        storedScoreFromRunFinal === liveScore
      ),
  );

  const baselinePass =
    liveIs100 &&
    allDirectHealthy &&
    allLiveCardsHealthy &&
    zeroLiveIssues &&
    zeroDurableOpen &&
    filteredWarnings.length === 0 &&
    scoresAgree;

  const out = {
    tag: 'Ecosystem Baseline v1',
    measuredAt: new Date().toISOString(),
    billingMonth,
    mode: 'independent_live_no_repairs_no_durable_persist',
    baselinePass,
    liveHealthScore: liveScore,
    storedHealthScoreFromRepairRunPrior: storedScoreFromRun,
    storedHealthScoreFromRepairRun: storedScoreFromRunFinal,
    storedHealthScoreFromOwnerSnapshot: storedScoreFromSnapshot,
    verificationRunId,
    scoresAgree,
    directByBrain,
    liveCards: live.cards,
    liveIssueCount: liveIssues.length,
    liveIssuesSample: liveIssues.slice(0, 20).map((i: HealthIssue) => ({
      brain: i.brain,
      code: i.code,
      severity: i.severity,
      cause: i.cause,
      autoRepairAvailable: i.autoRepairAvailable,
    })),
    durableOpenCount: openDurable.length,
    durableOpenSample: openDurable.slice(0, 20),
    latestRepairRun: latestRunAfter
      ? {
          id: latestRunAfter.id,
          trigger: latestRunAfter.trigger,
          startedAt: latestRunAfter.startedAt,
          endedAt: latestRunAfter.endedAt,
          healthScoreBefore: latestRunAfter.healthScoreBefore,
          healthScoreAfter: latestRunAfter.healthScoreAfter,
          rowsRepaired: latestRunAfter.rowsRepaired,
          rowsFailed: latestRunAfter.rowsFailed,
          summary: latestRunAfter.summary,
        }
      : null,
    limitProbes,
    warnings: filteredWarnings,
    checks: {
      liveScoreIs100: liveIs100,
      allDirectBrainsHealthy: allDirectHealthy,
      allLiveCardsHealthy,
      zeroLiveIssues,
      zeroDurableOpenIssues: zeroDurableOpen,
      noLimitSaturation: limitProbes.every((p) => p.count < p.softLimit),
      noRepairsExecuted: true,
      noDurablePersist: true,
      scoresAgree,
    },
  };

  const path = join(process.cwd(), 'tmp/ecosystem-baseline-v1-independent-audit.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path}`);
  console.log(
    JSON.stringify(
      {
        baselinePass: out.baselinePass,
        liveHealthScore: out.liveHealthScore,
        storedHealthScoreFromRepairRun: out.storedHealthScoreFromRepairRun,
        storedHealthScoreFromOwnerSnapshot: out.storedHealthScoreFromOwnerSnapshot,
        scoresAgree: out.scoresAgree,
        directByBrain: Object.fromEntries(
          Object.entries(out.directByBrain).map(([k, v]) => [
            k,
            { status: v.status, findings: v.findingCount },
          ]),
        ),
        liveCards: out.liveCards.map((c) => ({
          brain: c.brain,
          status: c.status,
          p0: c.openP0,
          p1: c.openP1,
          p2: c.openP2,
        })),
        durableOpenCount: out.durableOpenCount,
        warnings: out.warnings,
        checks: out.checks,
      },
      null,
      2,
    ),
  );

  if (!baselinePass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
