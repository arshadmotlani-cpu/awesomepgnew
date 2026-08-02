/**
 * Wave 3 — RFE via Bed Brain bridge parity check.
 */

import {
  failFinding,
  passFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationFinding } from '@/src/roomOs/certification/types';
import { buildBookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import { loadBookingTotalsViaBedBrain } from '@/src/roomOs/bridges/rfeBedBrainBridge';
import type { ResidentCertTarget } from '@/src/roomOs/certification/checks/bookingLedgerParity';

export async function runRfeBedBrainBridgeChecks(
  residents: ResidentCertTarget[],
  asOf: string,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  for (const resident of residents) {
    const [context, ledger] = await Promise.all([
      buildBookingContextSnapshot({ bookingId: resident.bookingId, asOf }),
      loadBookingTotalsViaBedBrain({ bookingId: resident.bookingId, asOf }),
    ]);

    if (!context || !ledger) {
      findings.push(
        failFinding(
          'RFE_BED_BRAIN_BRIDGE',
          'ledger',
          `${resident.customerName}: unable to resolve booking context via Bed Brain.`,
          undefined,
          undefined,
          { bookingId: resident.bookingId },
        ),
      );
      continue;
    }

    if (context.bookingContext.bookingId !== resident.bookingId) {
      findings.push(
        failFinding(
          'RFE_BED_BRAIN_BRIDGE',
          'occupancy',
          `${resident.customerName}: booking context bookingId mismatch.`,
          resident.bookingId,
          context.bookingContext.bookingId,
          { bookingId: resident.bookingId },
        ),
      );
      continue;
    }

    if (context.ledger?.totals.outstandingPaise !== ledger.totals.outstandingPaise) {
      findings.push(
        failFinding(
          'RFE_BED_BRAIN_BRIDGE',
          'ledger',
          `${resident.customerName}: context ledger vs bridge ledger mismatch.`,
          String(context.ledger?.totals.outstandingPaise),
          String(ledger.totals.outstandingPaise),
          { bookingId: resident.bookingId },
        ),
      );
      continue;
    }

    findings.push(
      passFinding(
        'RFE_BED_BRAIN_BRIDGE',
        'ledger',
        `${resident.customerName}: RFE bridge resolves via Bed Brain → LedgerProjection (${ledger.totals.outstandingPaise} paise outstanding).`,
        {
          bookingId: resident.bookingId,
          bedId: context.bedId,
          rentPointer: context.bookingContext.rentInvoicePointer ?? null,
        },
      ),
    );
  }

  return findings;
}
