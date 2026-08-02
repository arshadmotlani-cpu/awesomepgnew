/**
 * Certification report formatting for CLI release gates.
 */

import type { CertificationFinding, CertificationReport } from '@/src/roomOs/certification/types';

export function formatCertificationFindingLine(finding: CertificationFinding): string {
  const severity = finding.severity.toUpperCase().padEnd(7);
  const detail =
    finding.expected != null && finding.actual != null
      ? ` (expected ${finding.expected}, actual ${finding.actual})`
      : '';
  return `[${severity}] ${finding.checkId}: ${finding.message}${detail}`;
}

export function formatCertificationReportTable(report: CertificationReport): string {
  const lines: string[] = [
    'Room OS Certification Report',
    `Suite: ${report.suiteId}`,
    `Property: ${report.pgName ?? report.pgId}`,
    `Billing month: ${report.billingMonth}`,
    `As of: ${report.asOf}`,
    `Status: ${report.status.toUpperCase()}`,
    `Summary: ${report.summary.passCount} pass, ${report.summary.warningCount} warning, ${report.summary.failCount} fail`,
  ];

  if (report.summary.shantinagarResidents) {
    const r = report.summary.shantinagarResidents;
    lines.push(
      `Portal parity: ${r.passed}/${r.total} passed — ${r.certified ? 'CERTIFIED' : 'NOT CERTIFIED'}`,
    );
  }

  lines.push('', 'Findings:');
  for (const finding of report.findings) {
    if (finding.severity === 'pass') continue;
    lines.push(formatCertificationFindingLine(finding));
  }

  const failures = report.findings.filter((f) => f.severity === 'fail');
  if (failures.length === 0 && report.status !== 'fail') {
    lines.push('  (no fail-severity findings)');
  }

  return lines.join('\n');
}

/** Release gate: block only on fail status; warnings allowed pre-cutover. */
export function certificationBlocksRelease(report: CertificationReport): boolean {
  return report.status === 'fail';
}
