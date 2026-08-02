/**
 * Shantinagar portal parity — wraps Phase 1 portal certification SSOT.
 */

import {
  failFinding,
  passFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationFinding } from '@/src/roomOs/certification/types';
import {
  runShantinagarPhase1PortalCertification,
  type ShantinagarPhase1CertReport,
} from '@/src/services/shantinagarPhase1PortalCertification';

export async function runShantinagarPortalParityChecks(): Promise<{
  findings: CertificationFinding[];
  portalReport: ShantinagarPhase1CertReport;
}> {
  const portalReport = await runShantinagarPhase1PortalCertification();
  const findings: CertificationFinding[] = [];

  if (!portalReport.pgId) {
    findings.push(
      failFinding(
        'SHANTINAGAR_PORTAL_PARITY',
        'portal',
        portalReport.summary.blockers[0] ?? 'Shantinagar PG not found.',
      ),
    );
    return { findings, portalReport };
  }

  if (portalReport.residents.length === 0) {
    findings.push(
      failFinding(
        'SHANTINAGAR_PORTAL_PARITY',
        'portal',
        'No active Shantinagar residents found for portal parity.',
      ),
    );
    return { findings, portalReport };
  }

  for (const resident of portalReport.residents) {
    if (resident.pass) {
      findings.push(
        passFinding(
          'SHANTINAGAR_PORTAL_PARITY',
          'portal',
          `${resident.residentName} (${resident.roomBed}): portal parity PASS.`,
          { bookingId: resident.bookingId },
        ),
      );
      continue;
    }

    for (const mismatch of resident.mismatches) {
      findings.push(
        failFinding(
          'SHANTINAGAR_PORTAL_PARITY',
          'portal',
          `${resident.residentName} (${resident.roomBed}): ${mismatch.field} — ${mismatch.rootCause}`,
          String(mismatch.expectedPaise),
          String(mismatch.actualPaise),
          {
            bookingId: resident.bookingId,
            field: mismatch.field,
            expectedSource: mismatch.expectedSource,
            actualSource: mismatch.actualSource,
          },
        ),
      );
    }
  }

  if (portalReport.summary.certified) {
    findings.push(
      passFinding(
        'SHANTINAGAR_PORTAL_PARITY',
        'portal',
        `Shantinagar portal certified ${portalReport.summary.passed}/${portalReport.summary.totalResidents}.`,
      ),
    );
  }

  return { findings, portalReport };
}
