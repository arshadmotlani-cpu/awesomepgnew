/**
 * Certification finding helpers and report assembly.
 */

import { randomUUID } from 'node:crypto';
import {
  CERTIFICATION_CONTRACT_VERSION,
  type CertificationCheckContext,
  type CertificationDomain,
  type CertificationFinding,
  type CertificationOverallStatus,
  type CertificationReport,
  type CertificationSeverity,
} from '@/src/roomOs/certification/types';

export function certificationFinding(input: {
  checkId: string;
  domain: CertificationDomain;
  severity: CertificationSeverity;
  message: string;
  expected?: string;
  actual?: string;
  context?: Record<string, unknown>;
}): CertificationFinding {
  return input;
}

export function passFinding(
  checkId: string,
  domain: CertificationDomain,
  message: string,
  context?: Record<string, unknown>,
): CertificationFinding {
  return certificationFinding({ checkId, domain, severity: 'pass', message, context });
}

export function warnFinding(
  checkId: string,
  domain: CertificationDomain,
  message: string,
  expected?: string,
  actual?: string,
  context?: Record<string, unknown>,
): CertificationFinding {
  return certificationFinding({
    checkId,
    domain,
    severity: 'warning',
    message,
    expected,
    actual,
    context,
  });
}

export function failFinding(
  checkId: string,
  domain: CertificationDomain,
  message: string,
  expected?: string,
  actual?: string,
  context?: Record<string, unknown>,
): CertificationFinding {
  return certificationFinding({
    checkId,
    domain,
    severity: 'fail',
    message,
    expected,
    actual,
    context,
  });
}

export function aggregateCertificationStatus(
  findings: CertificationFinding[],
): CertificationOverallStatus {
  if (findings.some((f) => f.severity === 'fail')) return 'fail';
  if (findings.some((f) => f.severity === 'warning')) return 'warning';
  return 'pass';
}

export function buildCertificationReport(input: {
  suiteId: string;
  ctx: CertificationCheckContext;
  findings: CertificationFinding[];
  shantinagarResidents?: CertificationReport['summary']['shantinagarResidents'];
  reportId?: string;
  computedAt?: string;
}): CertificationReport {
  const passCount = input.findings.filter((f) => f.severity === 'pass').length;
  const warningCount = input.findings.filter((f) => f.severity === 'warning').length;
  const failCount = input.findings.filter((f) => f.severity === 'fail').length;

  return {
    reportId: input.reportId ?? randomUUID(),
    contractVersion: CERTIFICATION_CONTRACT_VERSION,
    suiteId: input.suiteId,
    pgId: input.ctx.pgId,
    pgName: input.ctx.pgName,
    billingMonth: input.ctx.billingMonth,
    asOf: input.ctx.asOf,
    computedAt: input.computedAt ?? new Date().toISOString(),
    status: aggregateCertificationStatus(input.findings),
    findings: input.findings,
    summary: {
      passCount,
      warningCount,
      failCount,
      totalChecks: input.findings.length,
      shantinagarResidents: input.shantinagarResidents,
    },
  };
}
