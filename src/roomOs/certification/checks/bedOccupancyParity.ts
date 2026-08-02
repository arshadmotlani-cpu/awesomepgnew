/**
 * Bed-level occupancy parity for active Shantinagar residents.
 */

import {
  failFinding,
  passFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationFinding } from '@/src/roomOs/certification/types';
import { buildBedBrainSnapshot } from '@/src/roomOs/engines/occupancy';
import type { ResidentCertTarget } from '@/src/roomOs/certification/checks/bookingLedgerParity';

export async function runBedOccupancyParityChecks(
  residents: ResidentCertTarget[],
  asOf: string,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  for (const resident of residents) {
    const bed = await buildBedBrainSnapshot({ bedId: resident.bedId, asOf });
    if (!bed?.bookingContext) {
      findings.push(
        failFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `${resident.customerName}: Bed Brain has no booking context for active resident bed.`,
          resident.bookingId,
          'none',
          { bedId: resident.bedId },
        ),
      );
      continue;
    }

    if (bed.bookingContext.bookingId === resident.bookingId) {
      findings.push(
        passFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `${resident.customerName}: bed ${resident.roomBed} assigned to booking ${resident.bookingId}.`,
          {
            bedId: resident.bedId,
            residencyStatus: bed.bookingContext.residencyStatus,
          },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `${resident.customerName}: bed assignment mismatch.`,
          resident.bookingId,
          bed.bookingContext.bookingId,
          { bedId: resident.bedId },
        ),
      );
    }

    if (
      bed.bookingContext.residencyStatus === 'active' ||
      bed.bookingContext.residencyStatus === 'vacating'
    ) {
      findings.push(
        passFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `${resident.customerName}: residency status ${bed.bookingContext.residencyStatus}.`,
          { bedId: resident.bedId },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `${resident.customerName}: expected active/vacating residency on occupied bed.`,
          'active|vacating',
          bed.bookingContext.residencyStatus,
          { bedId: resident.bedId },
        ),
      );
    }
  }

  return findings;
}
