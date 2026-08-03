/**
 * Shantinagar parity runner — Room OS projections vs legacy SSOT.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { runBedOccupancyParityChecks } from '@/src/roomOs/certification/checks/bedOccupancyParity';
import { runBookingLedgerParityChecks } from '@/src/roomOs/certification/checks/bookingLedgerParity';
import { runShantinagarPortalParityChecks } from '@/src/roomOs/certification/checks/portalParity';
import { runPropertyIndexParityChecks } from '@/src/roomOs/certification/checks/propertyIndexParity';
import { runRfeBedBrainBridgeChecks } from '@/src/roomOs/certification/checks/rfeBedBrainBridge';
import { runReplaySampleParityChecks } from '@/src/roomOs/certification/checks/replaySampleParity';
import { runBusinessMetricsRollupParityChecks } from '@/src/roomOs/certification/checks/businessMetricsRollupParity';
import { runRulesDbParityChecks } from '@/src/roomOs/certification/checks/rulesDbParity';
import { runTimelineLayerBChecks } from '@/src/roomOs/certification/checks/timelineLayerB';
import { runWorkflowPaymentProofParityChecks } from '@/src/roomOs/certification/checks/workflowPaymentProofParity';
import { runWorkQueueParityChecks } from '@/src/roomOs/certification/checks/workQueueParity';
import { buildCertificationReport, warnFinding } from '@/src/roomOs/certification/buildReport';
import { CERTIFICATION_SUITE_SHANTINAGAR_V1 } from '@/src/roomOs/certification/catalog/v1';
import { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';
import type {
  CertificationCheckContext,
  CertificationFinding,
  CertificationReport,
  CertificationScope,
} from '@/src/roomOs/certification/types';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { listActiveShantinagarResidents } from '@/src/services/shantinagarJulyRentProduction';

export type RunCertificationResult =
  | { ok: true; report: CertificationReport }
  | { ok: false; error: { code: 'PG_NOT_FOUND' | 'CERTIFICATION_UNAVAILABLE'; message: string } };

export async function runShantinagarCertification(
  input: Partial<CertificationScope> = {},
): Promise<RunCertificationResult> {
  const shantinagar = await resolveShantinagarPgId();
  if (!shantinagar) {
    return {
      ok: false,
      error: { code: 'PG_NOT_FOUND', message: 'Shantinagar PG not found.' },
    };
  }

  return runCertification({
    pgId: shantinagar.pgId,
    billingMonth: input.billingMonth,
    asOf: input.asOf,
    suiteId: CERTIFICATION_SUITE_SHANTINAGAR_V1,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  });
}

/** Read-only certification — compares Room OS projections to legacy SSOT. */
export async function runCertification(scope: CertificationScope): Promise<RunCertificationResult> {
  try {
    const asOf = scope.asOf ?? todayString();
    const billingMonth = firstOfMonth(scope.billingMonth ?? asOf);
    const suiteId = scope.suiteId ?? CERTIFICATION_SUITE_SHANTINAGAR_V1;

    const [pg] = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(eq(pgs.id, scope.pgId))
      .limit(1);
    if (!pg) {
      return { ok: false, error: { code: 'PG_NOT_FOUND', message: `Property ${scope.pgId} not found.` } };
    }

    const ctx: CertificationCheckContext = {
      pgId: pg.id,
      pgName: pg.name,
      billingMonth,
      asOf,
    };

    const isShantinagarSuite = suiteId === CERTIFICATION_SUITE_SHANTINAGAR_V1;
    const findings: CertificationFinding[] = [];

    const [propertyFindings, workQueueFindings, replayFindings, rulesFindings, timelineFindings, workflowFindings, metricsFindings] =
      await Promise.all([
      runPropertyIndexParityChecks(ctx),
      runWorkQueueParityChecks(ctx),
      runReplaySampleParityChecks(ctx),
      runRulesDbParityChecks(ctx),
      runTimelineLayerBChecks(ctx),
      runWorkflowPaymentProofParityChecks(ctx),
      runBusinessMetricsRollupParityChecks(ctx),
    ]);
    findings.push(
      ...propertyFindings,
      ...workQueueFindings,
      ...replayFindings,
      ...rulesFindings,
      ...timelineFindings,
      ...workflowFindings,
      ...metricsFindings,
    );

    let shantinagarResidents: CertificationReport['summary']['shantinagarResidents'];

    if (isShantinagarSuite) {
      const residents = await listActiveShantinagarResidents(pg.id);
      const residentTargets = residents.map((r) => ({
        bookingId: r.bookingId,
        customerName: r.customerName,
        roomBed: `R${r.roomNumber} · ${r.bedCode}`,
        bedId: r.bedId,
      }));

      const [ledgerFindings, occupancyFindings, portalResult, bridgeFindings] = await Promise.all([
        runBookingLedgerParityChecks(residentTargets, asOf),
        runBedOccupancyParityChecks(residentTargets, asOf),
        runShantinagarPortalParityChecks(),
        runRfeBedBrainBridgeChecks(residentTargets, asOf),
      ]);

      findings.push(...ledgerFindings, ...occupancyFindings, ...portalResult.findings, ...bridgeFindings);
      shantinagarResidents = {
        total: portalResult.portalReport.summary.totalResidents,
        passed: portalResult.portalReport.summary.passed,
        failed: portalResult.portalReport.summary.failed,
        certified: portalResult.portalReport.summary.certified,
      };
    } else {
      findings.push(
        warnFinding(
          'SHANTINAGAR_PORTAL_PARITY',
          'portal',
          'Resident-level and portal parity checks skipped — use shantinagar-v1 suite.',
        ),
      );
    }

    const report = buildCertificationReport({
      suiteId,
      ctx,
      findings,
      shantinagarResidents,
    });

    return { ok: true, report };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'CERTIFICATION_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Certification run failed.',
      },
    };
  }
}
