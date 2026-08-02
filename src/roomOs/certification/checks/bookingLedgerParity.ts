/**
 * Per-booking ledger and payment proof parity checks.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgPaymentRecords } from '@/src/db/schema';
import {
  failFinding,
  passFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationFinding } from '@/src/roomOs/certification/types';
import { buildBookingLedgerSnapshot } from '@/src/roomOs/engines/ledger';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';

export type ResidentCertTarget = {
  bookingId: string;
  customerName: string;
  roomBed: string;
  bedId: string;
};

async function countPendingPaymentProofs(bookingId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pgPaymentRecords)
    .where(and(eq(pgPaymentRecords.bookingId, bookingId), eq(pgPaymentRecords.status, 'pending')));
  return row?.count ?? 0;
}

export async function runBookingLedgerParityChecks(
  residents: ResidentCertTarget[],
  asOf: string,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  for (const resident of residents) {
    const [ledger, ssot, pendingProofCount] = await Promise.all([
      buildBookingLedgerSnapshot({ bookingId: resident.bookingId, asOf }),
      getBookingFinancialAccount(resident.bookingId),
      countPendingPaymentProofs(resident.bookingId),
    ]);

    if (!ledger || !ssot) {
      findings.push(
        failFinding(
          'BOOKING_LEDGER_PARITY',
          'ledger',
          `${resident.customerName}: unable to load ledger or SSOT account.`,
          undefined,
          undefined,
          { bookingId: resident.bookingId },
        ),
      );
      continue;
    }

    const comparisons: Array<{
      label: string;
      expected: number;
      actual: number;
    }> = [
      {
        label: 'rent.outstandingPaise',
        expected: ssot.rent.outstandingPaise,
        actual: ledger.rent.outstandingPaise,
      },
      {
        label: 'electricity.outstandingPaise',
        expected: ssot.electricity.outstandingPaise,
        actual: ledger.electricity.outstandingPaise,
      },
      {
        label: 'deposit.outstandingPaise',
        expected: ssot.deposit.outstandingPaise,
        actual: ledger.deposit.outstandingPaise,
      },
      {
        label: 'deposit.refundablePaise',
        expected: ssot.deposit.refundablePaise,
        actual: ledger.deposit.refundablePaise,
      },
      {
        label: 'totals.outstandingPaise',
        expected: ssot.totals.outstandingPaise,
        actual: ledger.totals.outstandingPaise,
      },
    ];

    for (const comparison of comparisons) {
      if (comparison.expected === comparison.actual) {
        findings.push(
          passFinding(
            'BOOKING_LEDGER_PARITY',
            'ledger',
            `${resident.customerName}: ${comparison.label} matches (${comparison.expected} paise).`,
            { bookingId: resident.bookingId, field: comparison.label },
          ),
        );
      } else {
        findings.push(
          failFinding(
            'BOOKING_LEDGER_PARITY',
            'ledger',
            `${resident.customerName}: ${comparison.label} mismatch (Room OS ledger vs SSOT).`,
            String(comparison.expected),
            String(comparison.actual),
            { bookingId: resident.bookingId, field: comparison.label },
          ),
        );
      }
    }

    const expectedProofState =
      pendingProofCount > 0 ? 'proof_pending' : ledger.paymentState === 'checkout_open' ? 'checkout_open' : 'clear';
    if (ledger.paymentState === expectedProofState) {
      findings.push(
        passFinding(
          'PAYMENT_PROOF_STATE_PARITY',
          'ledger',
          `${resident.customerName}: payment state ${ledger.paymentState} matches proof/checkout signals.`,
          { bookingId: resident.bookingId, pendingProofCount },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'PAYMENT_PROOF_STATE_PARITY',
          'ledger',
          `${resident.customerName}: payment state mismatch.`,
          expectedProofState,
          ledger.paymentState,
          { bookingId: resident.bookingId, pendingProofCount },
        ),
      );
    }
  }

  return findings;
}
