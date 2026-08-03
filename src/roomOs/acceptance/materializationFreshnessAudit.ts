/**
 * Materialized index freshness — Wave 2 acceptance audit.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { propertyOsIndex } from '@/src/db/schema/propertyOsIndex';
import { workQueueIndex } from '@/src/db/schema/workQueueIndex';
import { businessMetricsIndex } from '@/src/db/schema/businessMetricsIndex';
import { runPropertyIndexParityChecks } from '@/src/roomOs/certification/checks/propertyIndexParity';
import { runWorkQueueParityChecks } from '@/src/roomOs/certification/checks/workQueueParity';
import { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';
import {
  evaluateRoomOsOutboxHealth,
  getRoomOsOutboxMetrics,
} from '@/src/roomOs/outbox/metrics';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export type MaterializationFreshnessRow = {
  pgId: string;
  pgName: string;
  propertyMaterializedAgeMs: number | null;
  workQueueMaterializedAgeMs: number | null;
  businessMetricsMaterializedAgeMs: number | null;
  severity: 'pass' | 'warning' | 'fail';
  message: string;
};

export type MaterializationFreshnessReport = {
  pass: boolean;
  outboxPass: boolean;
  rows: MaterializationFreshnessRow[];
  propertyIndexFailCount: number;
  workQueueFailCount: number;
  summary: string;
};

export type FreshnessThresholds = {
  warnAgeMs: number;
  failAgeMs: number;
};

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  warnAgeMs: 6 * 60 * 60 * 1000,
  failAgeMs: 24 * 60 * 60 * 1000,
};

export function classifyMaterializedAge(
  ageMs: number | null,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
): 'pass' | 'warning' | 'fail' {
  if (ageMs == null) return 'warning';
  if (ageMs > thresholds.failAgeMs) return 'fail';
  if (ageMs > thresholds.warnAgeMs) return 'warning';
  return 'pass';
}

export function mergeFreshnessSeverity(
  a: 'pass' | 'warning' | 'fail',
  b: 'pass' | 'warning' | 'fail',
): 'pass' | 'warning' | 'fail' {
  if (a === 'fail' || b === 'fail') return 'fail';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'pass';
}

export async function runMaterializationFreshnessAudit(
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
): Promise<MaterializationFreshnessReport> {
  const outboxMetrics = await getRoomOsOutboxMetrics();
  const outboxHealth = evaluateRoomOsOutboxHealth(outboxMetrics);

  const shantinagar = await resolveShantinagarPgId();
  const rows: MaterializationFreshnessRow[] = [];

  if (shantinagar) {
    const billingMonth = firstOfMonth(todayString());
    const [propertyRow, workQueueRow, businessMetricsRow] = await Promise.all([
      db
        .select({
          materializedAt: propertyOsIndex.materializedAt,
        })
        .from(propertyOsIndex)
        .where(
          and(
            eq(propertyOsIndex.pgId, shantinagar.pgId),
            eq(propertyOsIndex.billingMonth, billingMonth),
          ),
        )
        .limit(1),
      db
        .select({
          materializedAt: workQueueIndex.materializedAt,
        })
        .from(workQueueIndex)
        .where(
          and(
            eq(workQueueIndex.pgId, shantinagar.pgId),
            eq(workQueueIndex.billingMonth, billingMonth),
          ),
        )
        .limit(1),
      db
        .select({
          materializedAt: businessMetricsIndex.materializedAt,
        })
        .from(businessMetricsIndex)
        .where(
          and(
            eq(businessMetricsIndex.pgId, shantinagar.pgId),
            eq(businessMetricsIndex.billingMonth, billingMonth),
          ),
        )
        .limit(1),
    ]);

    const propertyAgeMs = propertyRow[0]?.materializedAt
      ? Date.now() - propertyRow[0].materializedAt.getTime()
      : null;
    const workQueueAgeMs = workQueueRow[0]?.materializedAt
      ? Date.now() - workQueueRow[0].materializedAt.getTime()
      : null;
    const businessMetricsAgeMs = businessMetricsRow[0]?.materializedAt
      ? Date.now() - businessMetricsRow[0].materializedAt.getTime()
      : null;

    const propertySeverity = classifyMaterializedAge(propertyAgeMs, thresholds);
    const workQueueSeverity = classifyMaterializedAge(workQueueAgeMs, thresholds);
    const businessMetricsSeverity = classifyMaterializedAge(businessMetricsAgeMs, thresholds);
    const severity = mergeFreshnessSeverity(
      mergeFreshnessSeverity(propertySeverity, workQueueSeverity),
      businessMetricsSeverity,
    );

    rows.push({
      pgId: shantinagar.pgId,
      pgName: shantinagar.pgName,
      propertyMaterializedAgeMs: propertyAgeMs,
      workQueueMaterializedAgeMs: workQueueAgeMs,
      businessMetricsMaterializedAgeMs: businessMetricsAgeMs,
      severity,
      message:
        propertyAgeMs == null || workQueueAgeMs == null || businessMetricsAgeMs == null
          ? 'Missing materialized row — live fallback only (pre-cutover warning).'
          : `Property age ${Math.round((propertyAgeMs ?? 0) / 60_000)}m; work queue age ${Math.round((workQueueAgeMs ?? 0) / 60_000)}m; business metrics age ${Math.round((businessMetricsAgeMs ?? 0) / 60_000)}m.`,
    });
  }

  let propertyIndexFailCount = 0;
  let workQueueFailCount = 0;

  if (shantinagar) {
    const asOf = todayString();
    const billingMonth = firstOfMonth(asOf);
    const ctx = {
      pgId: shantinagar.pgId,
      pgName: shantinagar.pgName,
      billingMonth,
      asOf,
    };
    const [propertyFindings, workQueueFindings] = await Promise.all([
      runPropertyIndexParityChecks(ctx),
      runWorkQueueParityChecks(ctx),
    ]);
    propertyIndexFailCount = propertyFindings.filter((f) => f.severity === 'fail').length;
    workQueueFailCount = workQueueFindings.filter((f) => f.severity === 'fail').length;
  }

  const freshnessPass = rows.every((r) => r.severity !== 'fail');
  const parityPass = propertyIndexFailCount === 0 && workQueueFailCount === 0;
  const pass = outboxHealth.pass && freshnessPass && parityPass;

  return {
    pass,
    outboxPass: outboxHealth.pass,
    rows,
    propertyIndexFailCount,
    workQueueFailCount,
    summary: pass
      ? 'Materialization freshness audit PASS.'
      : `Materialization freshness audit FAIL — outbox=${outboxHealth.pass ? 'ok' : 'bad'}, freshness=${freshnessPass ? 'ok' : 'bad'}, parity=${parityPass ? 'ok' : 'bad'}.`,
  };
}

/** Age of newest materialized property index row for monitoring. */
export async function oldestPendingOutboxAgeMs(): Promise<number | null> {
  const metrics = await getRoomOsOutboxMetrics();
  return metrics.oldestPendingAgeMs;
}

export async function countMaterializedPropertyRows(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(propertyOsIndex);
  return row?.count ?? 0;
}
