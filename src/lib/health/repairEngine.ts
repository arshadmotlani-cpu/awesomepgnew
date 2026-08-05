/**
 * Wave 2 Repair Engine — registry, durable issues, dispatch, telemetry.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  brainIntegrityIssues,
  brainRepairEvents,
  brainRepairRuns,
} from '@/src/db/schema/brainRepairEngine';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import type {
  AllBrainIntegrityReport,
  HealthBrainName,
  HealthIssue,
  HealthIssueSeverity,
} from '@/src/lib/health/healthBrain';
import { logger } from '@/src/lib/logger';

export type RepairFnId =
  | 'repairOrphanReservesBlockingActiveStay'
  | 'repairStaleDraftReservesWithoutHold'
  | 'repairExpiredReservesWithoutHold'
  | 'excludeInvalidPaymentReviews'
  | 'cleanupSyntheticPaymentReviews'
  | 'repairMissingRentInvoiceConservative'
  | 'repairMissingElectricityBillConservative'
  | 'repairMissingBillingProfile'
  | 'repairStuckElectricityGenerationJob'
  | 'repairAbandonedDraftsWithActiveStay'
  | 'repairResidencyTenancyDrift'
  | 'repairUnambiguousOrphanRentPaymentLinks'
  | 'repairEndedConfirmedFixedStayBookings'
  | 'repairMissingBills'; // explicitly never auto

export type RepairExecuteResult = {
  ok: boolean;
  rowsTouched: number;
  skipped?: number;
  message?: string;
  diff?: Record<string, unknown>;
};

export type RepairContext = {
  trigger: 'cron' | 'ui' | 'script';
  billingMonth?: string;
  dryRun?: boolean;
  issue?: HealthIssue;
  fingerprint?: string;
  issueRowId?: string | null;
};

type RepairHandler = (ctx: RepairContext) => Promise<RepairExecuteResult>;

type RepairRegistration = {
  id: RepairFnId;
  auto: boolean;
  description: string;
  /** Issue codes this repair can handle (empty = batch/global). */
  codes: string[];
  execute: RepairHandler;
};

const registry = new Map<RepairFnId, RepairRegistration>();

export function registerRepair(reg: RepairRegistration): void {
  registry.set(reg.id, reg);
}

export function getRepairRegistration(id: RepairFnId): RepairRegistration | undefined {
  return registry.get(id);
}

export function listRepairRegistry(): RepairRegistration[] {
  return [...registry.values()];
}

export function fingerprintForIssue(issue: Pick<HealthIssue, 'brain' | 'code' | 'entityId'>): string {
  return `${issue.brain}:${issue.code}:${issue.entityId ?? 'none'}`;
}

export function computeHealthScore(issues: HealthIssue[]): number {
  const brains: HealthBrainName[] = [
    'Resident',
    'Booking',
    'Finance',
    'Electricity',
    'Operations',
    'Health',
  ];
  const actionable = issues.filter((i) => i.code !== 'OPEN_P0_AGGREGATE');
  const brainHealthy = (brain: HealthBrainName) =>
    !actionable.some((i) => i.brain === brain);

  // 100 only when every brain is Healthy (zero open integrity issues).
  if (brains.every(brainHealthy)) return 100;

  let penalty = 0;
  for (const i of actionable) {
    if (i.severity === 'P0') penalty += 8;
    else if (i.severity === 'P1') penalty += 3;
    else penalty += 1;
  }
  // Never report 100 while any brain still has drift.
  return Math.max(0, Math.min(99, Math.round((100 - penalty) * 10) / 10));
}

export function resolveRepairFnForIssue(issue: HealthIssue): RepairFnId | null {
  if (issue.code === 'PORTAL_BLOCKED_BY_ORPHAN_RESERVE' && issue.autoRepairAvailable) {
    return 'repairOrphanReservesBlockingActiveStay';
  }
  if (issue.code === 'STALE_DRAFT_NO_HOLD' && issue.autoRepairAvailable) {
    return 'repairStaleDraftReservesWithoutHold';
  }
  if (issue.code === 'EXPIRED_RESERVE_NO_HOLD' && issue.autoRepairAvailable) {
    return 'repairExpiredReservesWithoutHold';
  }
  if (issue.code === 'MISSING_CURRENT_MONTH_RENT' && issue.autoRepairAvailable) {
    return 'repairMissingRentInvoiceConservative';
  }
  if (
    (issue.code === 'MISSING_ELECTRICITY_WINDOW' || issue.code === 'METER_LOG_WITHOUT_BILL') &&
    issue.autoRepairAvailable
  ) {
    return 'repairMissingElectricityBillConservative';
  }
  if (issue.code === 'MISSING_BILLING_PROFILE' && issue.autoRepairAvailable) {
    return 'repairMissingBillingProfile';
  }
  if (issue.code === 'GENERATION_JOB_STUCK_WITHOUT_BILL' && issue.autoRepairAvailable) {
    return 'repairStuckElectricityGenerationJob';
  }
  if (issue.code === 'DRAFT_BOOKING_WITH_ACTIVE_STAY' && issue.autoRepairAvailable) {
    return 'repairAbandonedDraftsWithActiveStay';
  }
  if (
    (issue.code === 'ACTIVE_RESIDENCY_WITHOUT_TENANCY' ||
      issue.code === 'TENANCY_WITHOUT_ACTIVE_RESIDENCY') &&
    issue.autoRepairAvailable
  ) {
    return 'repairResidencyTenancyDrift';
  }
  if (issue.code === 'PAYMENT_WITHOUT_INVOICE' && issue.autoRepairAvailable) {
    return 'repairUnambiguousOrphanRentPaymentLinks';
  }
  if (issue.code === 'CONFIRMED_WITHOUT_BED' && issue.autoRepairAvailable) {
    return 'repairEndedConfirmedFixedStayBookings';
  }
  if (
    issue.brain === 'Operations' &&
    (issue.code === 'INVALID_BILLING_MONTH' ||
      issue.code === 'INVALID_SCREENSHOT' ||
      issue.code === 'DUPLICATE_SCREENSHOT' ||
      issue.code === 'ORPHAN_PROOF')
  ) {
    return 'cleanupSyntheticPaymentReviews';
  }
  if (issue.code === 'SYNTHETIC_PAYMENT_REVIEW') {
    return 'cleanupSyntheticPaymentReviews';
  }
  return null;
}

export async function upsertDurableIssues(issues: HealthIssue[]): Promise<{
  upserted: number;
  closed: number;
}> {
  const now = new Date();
  const seen = new Set<string>();
  let upserted = 0;

  for (const issue of issues) {
    if (issue.code === 'OPEN_P0_AGGREGATE') continue;
    const fingerprint = fingerprintForIssue(issue);
    seen.add(fingerprint);
    const repairFn = resolveRepairFnForIssue(issue);
    const auto = Boolean(issue.autoRepairAvailable && repairFn);
    const status = auto ? 'repair_available' : issue.severity === 'P0' || issue.severity === 'P1'
      ? 'needs_owner'
      : 'open';

    await db
      .insert(brainIntegrityIssues)
      .values({
        fingerprint,
        brain: issue.brain,
        code: issue.code,
        severity: issue.severity,
        entityType: issue.entityType,
        entityId: issue.entityId,
        cause: issue.cause,
        suggestedRepair: issue.suggestedRepair,
        repairFn,
        autoRepairable: auto,
        status,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: brainIntegrityIssues.fingerprint,
        set: {
          severity: issue.severity,
          cause: issue.cause,
          suggestedRepair: issue.suggestedRepair,
          repairFn,
          autoRepairable: auto,
          status: sql`CASE
            WHEN ${brainIntegrityIssues.status} IN ('repaired', 'closed') THEN ${status}::brain_issue_status
            WHEN ${brainIntegrityIssues.status} IN ('running', 'queued') THEN ${brainIntegrityIssues.status}
            ELSE ${status}::brain_issue_status
          END`,
          lastSeenAt: now,
          updatedAt: now,
          closedAt: null,
          repairedAt: sql`CASE
            WHEN ${status}::text IN ('repaired') THEN ${brainIntegrityIssues.repairedAt}
            ELSE NULL
          END`,
        },
      });
    upserted += 1;
  }

  const openRows = await db
    .select({ id: brainIntegrityIssues.id, fingerprint: brainIntegrityIssues.fingerprint })
    .from(brainIntegrityIssues)
    .where(
      inArray(brainIntegrityIssues.status, [
        'open',
        'repair_available',
        'queued',
        'failed',
        'needs_owner',
      ]),
    );

  let closed = 0;
  for (const row of openRows) {
    if (seen.has(row.fingerprint)) continue;
    await db
      .update(brainIntegrityIssues)
      .set({
        status: 'closed',
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(brainIntegrityIssues.id, row.id));
    closed += 1;
  }

  return { upserted, closed };
}

export async function loadOpenDurableIssues(opts?: {
  brain?: HealthBrainName;
  limit?: number;
}): Promise<typeof brainIntegrityIssues.$inferSelect[]> {
  const limit = opts?.limit ?? 200;
  const rows = await db
    .select()
    .from(brainIntegrityIssues)
    .where(
      and(
        inArray(brainIntegrityIssues.status, [
          'open',
          'repair_available',
          'queued',
          'failed',
          'needs_owner',
          'running',
        ]),
        opts?.brain ? eq(brainIntegrityIssues.brain, opts.brain) : undefined,
      ),
    )
    .orderBy(desc(brainIntegrityIssues.severity), desc(brainIntegrityIssues.lastSeenAt))
    .limit(limit);
  return rows;
}

export async function loadRecentRepairEvents(issueId: string, limit = 20) {
  return db
    .select()
    .from(brainRepairEvents)
    .where(eq(brainRepairEvents.issueId, issueId))
    .orderBy(desc(brainRepairEvents.createdAt))
    .limit(limit);
}

export async function loadLatestRepairRun() {
  const [row] = await db
    .select()
    .from(brainRepairRuns)
    .orderBy(desc(brainRepairRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function loadEcosystemHealthSnapshot(): Promise<{
  overallHealthPct: number;
  brainHealthPct: number;
  productionIntegrityPct: number;
  openIssues: number;
  autoRepairsToday: number;
  manualRepairsRequired: number;
  lastAuditAt: string | null;
  lastRepairAt: string | null;
  lastCriticalCause: string | null;
  byBrain: Array<{
    brain: string;
    status: 'Healthy' | 'Warning' | 'Critical';
    openP0: number;
    openP1: number;
    openP2: number;
  }>;
}> {
  const open = await loadOpenDurableIssues({ limit: 500 });
  const p0 = open.filter((i) => i.severity === 'P0').length;
  const p1 = open.filter((i) => i.severity === 'P1').length;
  const p2 = open.filter((i) => i.severity === 'P2').length;
  const needsOwner = open.filter((i) => i.status === 'needs_owner' || !i.autoRepairable).length;

  const syntheticLike = open.filter(
    (i) =>
      i.code === 'SYNTHETIC_PAYMENT_REVIEW' ||
      i.code === 'INVALID_BILLING_MONTH' ||
      i.code === 'INVALID_SCREENSHOT',
  ).length;

  const brainNames = ['Resident', 'Booking', 'Finance', 'Electricity', 'Operations', 'Health'];
  const byBrain = brainNames.map((brain) => {
    const subset = open.filter((i) => i.brain === brain);
    const bp0 = subset.filter((i) => i.severity === 'P0').length;
    const bp1 = subset.filter((i) => i.severity === 'P1').length;
    const bp2 = subset.filter((i) => i.severity === 'P2').length;
    const status =
      bp0 > 0 ? ('Critical' as const) : bp1 > 0 || bp2 > 0 ? ('Warning' as const) : ('Healthy' as const);
    return { brain, status, openP0: bp0, openP1: bp1, openP2: bp2 };
  });
  const score = byBrain.every((b) => b.status === 'Healthy')
    ? 100
    : Math.max(0, Math.min(99, Math.round((100 - (p0 * 8 + p1 * 3 + p2)) * 10) / 10));
  const healthyBrains = byBrain.filter((b) => b.status === 'Healthy').length;
  const brainHealthPct = Math.round((healthyBrains / brainNames.length) * 1000) / 10;
  const productionIntegrityPct = Math.max(0, Math.round((100 - syntheticLike * 10) * 10) / 10);

  const latest = await loadLatestRepairRun();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let autoRepairsToday = 0;
  try {
    const todayResult = await db.execute(sql`
      SELECT coalesce(sum(rows_repaired), 0)::int AS n
      FROM brain_repair_runs
      WHERE started_at >= ${startOfDay.toISOString()}::timestamptz
    `);
    const todayRows = Array.isArray(todayResult)
      ? todayResult
      : ((todayResult as { rows?: Array<{ n?: number }> })?.rows ?? []);
    autoRepairsToday = Number((todayRows[0] as { n?: number } | undefined)?.n ?? 0);
  } catch {
    autoRepairsToday = 0;
  }

  const lastCritical = open.find((i) => i.severity === 'P0') ?? null;

  return {
    overallHealthPct: score,
    brainHealthPct,
    productionIntegrityPct,
    openIssues: open.length,
    autoRepairsToday,
    manualRepairsRequired: needsOwner,
    lastAuditAt: latest?.startedAt?.toISOString?.() ?? latest?.startedAt?.toString?.() ?? null,
    lastRepairAt: latest?.endedAt?.toISOString?.() ?? latest?.endedAt?.toString?.() ?? null,
    lastCriticalCause: lastCritical?.cause ?? null,
    byBrain,
  };
}

async function ensureRepairsRegistered(): Promise<void> {
  if (registry.size > 0) return;
  await import('@/src/lib/health/repairHandlers');
}

export async function executeRepairFn(
  repairFn: RepairFnId,
  ctx: RepairContext,
): Promise<RepairExecuteResult> {
  await ensureRepairsRegistered();
  const reg = registry.get(repairFn);
  if (!reg) {
    return { ok: false, rowsTouched: 0, message: `Unknown repair fn ${repairFn}` };
  }
  if (ctx.dryRun) {
    return { ok: true, rowsTouched: 0, message: 'dry_run', diff: { repairFn } };
  }
  return reg.execute(ctx);
}

export async function dispatchSafeRepairs(opts: {
  trigger: 'cron' | 'ui' | 'script';
  billingMonth?: string;
  issues?: HealthIssue[];
  onlyFingerprint?: string;
  dryRun?: boolean;
}): Promise<{
  runId: string;
  rowsRepaired: number;
  rowsSkipped: number;
  rowsFailed: number;
  durationMs: number;
  healthScoreBefore: number;
  healthScoreAfter: number;
}> {
  await ensureRepairsRegistered();
  const t0 = performance.now();
  const scoreBefore = computeHealthScore(opts.issues ?? []);

  const [run] = await db
    .insert(brainRepairRuns)
    .values({
      trigger: opts.trigger,
      startedAt: new Date(),
      healthScoreBefore: String(scoreBefore),
      billingMonth: opts.billingMonth ?? null,
      summary: { phase: 'started' },
    })
    .returning();

  let rowsRepaired = 0;
  let rowsSkipped = 0;
  let rowsFailed = 0;
  let queryCount = 0;

  // Batch auto repairs that are global (not per-issue)
  const batchFns: RepairFnId[] = [
    'repairOrphanReservesBlockingActiveStay',
    'repairStaleDraftReservesWithoutHold',
    'repairExpiredReservesWithoutHold',
    'cleanupSyntheticPaymentReviews',
    'repairAbandonedDraftsWithActiveStay',
    'repairResidencyTenancyDrift',
    'repairEndedConfirmedFixedStayBookings',
    'repairUnambiguousOrphanRentPaymentLinks',
  ];

  if (!opts.onlyFingerprint) {
    for (const fnId of batchFns) {
      const reg = registry.get(fnId);
      if (!reg?.auto) continue;
      const started = performance.now();
      try {
        queryCount += 1;
        const result = await reg.execute({
          trigger: opts.trigger,
          billingMonth: opts.billingMonth,
          dryRun: opts.dryRun,
        });
        const durationMs = Math.round(performance.now() - started);
        if (result.ok) {
          rowsRepaired += result.rowsTouched;
          rowsSkipped += result.skipped ?? 0;
        } else {
          rowsFailed += 1;
        }
        await db.insert(brainRepairEvents).values({
          runId: run!.id,
          repairFn: fnId,
          result: result.ok ? 'repaired' : 'failed',
          error: result.message ?? null,
          durationMs,
          rowsTouched: result.rowsTouched,
          diff: result.diff ?? null,
        });
      } catch (err) {
        rowsFailed += 1;
        await db.insert(brainRepairEvents).values({
          runId: run!.id,
          repairFn: fnId,
          result: 'failed',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Math.round(performance.now() - started),
          rowsTouched: 0,
        });
      }
    }
  }

  // Per-issue targeted repairs
  const durable = opts.onlyFingerprint
    ? await db
        .select()
        .from(brainIntegrityIssues)
        .where(eq(brainIntegrityIssues.fingerprint, opts.onlyFingerprint))
        .limit(1)
    : await db
        .select()
        .from(brainIntegrityIssues)
        .where(
          and(
            eq(brainIntegrityIssues.autoRepairable, true),
            inArray(brainIntegrityIssues.status, ['repair_available', 'failed', 'open']),
          ),
        )
        .limit(100);

  for (const row of durable) {
    const fnId = (row.repairFn as RepairFnId | null) ?? null;
    if (!fnId) {
      rowsSkipped += 1;
      continue;
    }
    // Skip batch fns already executed unless single-fingerprint UI repair
    if (!opts.onlyFingerprint && batchFns.includes(fnId)) {
      rowsSkipped += 1;
      continue;
    }
    const reg = registry.get(fnId);
    if (!reg?.auto && !opts.onlyFingerprint) {
      rowsSkipped += 1;
      continue;
    }
    if (!reg) {
      rowsFailed += 1;
      continue;
    }

    await db
      .update(brainIntegrityIssues)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(brainIntegrityIssues.id, row.id));

    const started = performance.now();
    try {
      queryCount += 1;
      const result = await reg.execute({
        trigger: opts.trigger,
        billingMonth: opts.billingMonth,
        dryRun: opts.dryRun,
        fingerprint: row.fingerprint,
        issueRowId: row.id,
        issue: {
          id: row.fingerprint,
          severity: row.severity as HealthIssueSeverity,
          brain: row.brain as HealthBrainName,
          entityType: row.entityType,
          entityId: row.entityId,
          code: row.code,
          cause: row.cause,
          suggestedRepair: row.suggestedRepair,
          autoRepairAvailable: row.autoRepairable,
          status: 'repair_running',
        },
      });
      const durationMs = Math.round(performance.now() - started);
      if (result.ok && result.rowsTouched > 0) {
        rowsRepaired += result.rowsTouched;
        await db
          .update(brainIntegrityIssues)
          .set({
            status: 'repaired',
            repairedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(brainIntegrityIssues.id, row.id));
      } else if (result.ok) {
        rowsSkipped += result.skipped ?? 1;
        await db
          .update(brainIntegrityIssues)
          .set({
            status: row.autoRepairable ? 'repair_available' : 'needs_owner',
            updatedAt: new Date(),
          })
          .where(eq(brainIntegrityIssues.id, row.id));
      } else {
        rowsFailed += 1;
        await db
          .update(brainIntegrityIssues)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(brainIntegrityIssues.id, row.id));
      }
      await db.insert(brainRepairEvents).values({
        runId: run!.id,
        issueId: row.id,
        fingerprint: row.fingerprint,
        repairFn: fnId,
        result: result.ok ? (result.rowsTouched > 0 ? 'repaired' : 'skipped') : 'failed',
        error: result.message ?? null,
        durationMs,
        rowsTouched: result.rowsTouched,
        diff: result.diff ?? null,
      });
    } catch (err) {
      rowsFailed += 1;
      await db
        .update(brainIntegrityIssues)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(brainIntegrityIssues.id, row.id));
      await db.insert(brainRepairEvents).values({
        runId: run!.id,
        issueId: row.id,
        fingerprint: row.fingerprint,
        repairFn: fnId,
        result: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - started),
        rowsTouched: 0,
      });
      logger.error('repair_engine.execute_failed', {
        repairFn: fnId,
        fingerprint: row.fingerprint,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Re-score from remaining open durable issues
  const stillOpen = await loadOpenDurableIssues({ limit: 500 });
  const scoreAfter = Math.max(
    0,
    100 -
      stillOpen.filter((i) => i.severity === 'P0').length * 8 -
      stillOpen.filter((i) => i.severity === 'P1').length * 3 -
      stillOpen.filter((i) => i.severity === 'P2').length,
  );
  const durationMs = Math.round(performance.now() - t0);

  await db
    .update(brainRepairRuns)
    .set({
      endedAt: new Date(),
      durationMs,
      queryCount,
      rowsRepaired,
      rowsSkipped,
      rowsFailed,
      healthScoreAfter: String(scoreAfter),
      summary: {
        batchFns,
        onlyFingerprint: opts.onlyFingerprint ?? null,
        dryRun: Boolean(opts.dryRun),
      },
    })
    .where(eq(brainRepairRuns.id, run!.id));

  await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    action: 'health.repair_run.completed',
    entity: 'brain_repair_run',
    entityId: run!.id,
    diff: {
      trigger: opts.trigger,
      rowsRepaired,
      rowsSkipped,
      rowsFailed,
      healthScoreBefore: scoreBefore,
      healthScoreAfter: scoreAfter,
      durationMs,
    },
  }).catch(() => undefined);

  return {
    runId: run!.id,
    rowsRepaired,
    rowsSkipped,
    rowsFailed,
    durationMs,
    healthScoreBefore: scoreBefore,
    healthScoreAfter: scoreAfter,
  };
}

/** Attach repair metadata onto live HealthIssue list. */
export function enrichIssuesWithRepairMeta(issues: HealthIssue[]): HealthIssue[] {
  return issues.map((issue) => {
    const repairFn = resolveRepairFnForIssue(issue);
    const auto = Boolean(issue.autoRepairAvailable && repairFn);
    return {
      ...issue,
      autoRepairAvailable: auto,
      status: auto ? 'repair_available' : issue.status,
      suggestedRepair: repairFn
        ? `${issue.suggestedRepair} [${repairFn}]`
        : issue.suggestedRepair,
    };
  });
}

export function summarizeReportForScore(report: AllBrainIntegrityReport): number {
  return computeHealthScore(report.issues);
}
