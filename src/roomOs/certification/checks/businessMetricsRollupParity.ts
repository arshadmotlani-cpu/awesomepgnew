/**
 * BUSINESS_METRICS_ROLLUP_PARITY — materialized rollup matches property index + financial bridge.
 */

import { assembleBusinessMetrics } from '@/src/roomOs/metrics/assembleBusinessMetrics';
import { loadMaterializedBusinessMetrics } from '@/src/roomOs/metrics/persistBusinessMetricsIndex';
import { bridgeFinancialMetrics } from '@/src/roomOs/metrics/bridgeFinancialMetrics';
import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';

export async function runBusinessMetricsRollupParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  const [propertyIndex, workQueue, materialized] = await Promise.all([
    loadMaterializedPropertyIndex({ pgId: ctx.pgId, billingMonth: ctx.billingMonth }),
    loadMaterializedWorkQueue({ pgId: ctx.pgId, billingMonth: ctx.billingMonth }),
    loadMaterializedBusinessMetrics({ pgId: ctx.pgId, billingMonth: ctx.billingMonth }),
  ]);

  if (!propertyIndex) {
    findings.push(
      warnFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        'Property index not materialized — metrics parity skipped.',
      ),
    );
    return findings;
  }

  const live = await assembleBusinessMetrics({ propertyIndex, workQueue, asOf: ctx.asOf });

  if (live.property.proofsPending === propertyIndex.kpiStrip.proofsPending) {
    findings.push(
      passFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        `Ops proofs pending (${live.property.proofsPending}) matches property KPI strip.`,
      ),
    );
  } else {
    findings.push(
      failFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        'Proofs pending count mismatch between metrics rollup and property index.',
        String(propertyIndex.kpiStrip.proofsPending),
        String(live.property.proofsPending),
      ),
    );
  }

  const financialBridge = await bridgeFinancialMetrics({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
  });

  if (live.financial.operatingRevenuePaise === financialBridge.operatingRevenuePaise) {
    findings.push(
      passFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        `Financial operating revenue (${live.financial.operatingRevenuePaise} paise) matches financialMetricsEngine bridge.`,
      ),
    );
  } else {
    findings.push(
      failFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        'Financial operating revenue mismatch vs financialMetricsEngine bridge.',
        String(financialBridge.operatingRevenuePaise),
        String(live.financial.operatingRevenuePaise),
      ),
    );
  }

  if (materialized) {
    if (materialized.contentHash === live.contentHash) {
      findings.push(
        passFinding(
          'BUSINESS_METRICS_ROLLUP_PARITY',
          'metrics',
          'Materialized business_metrics_index content hash matches live assembly.',
        ),
      );
    } else {
      findings.push(
        failFinding(
          'BUSINESS_METRICS_ROLLUP_PARITY',
          'metrics',
          'Materialized business metrics hash differs from live assembly — rebuild required.',
          materialized.contentHash,
          live.contentHash,
        ),
      );
    }
  } else {
    findings.push(
      warnFinding(
        'BUSINESS_METRICS_ROLLUP_PARITY',
        'metrics',
        'business_metrics_index not materialized yet — live assembly used.',
      ),
    );
  }

  return findings;
}
