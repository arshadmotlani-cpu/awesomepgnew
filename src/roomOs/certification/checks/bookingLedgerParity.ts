/**
 * Per-booking ledger and payment proof parity checks.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import {
  failFinding,
  passFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationFinding } from '@/src/roomOs/certification/types';
import { buildBookingLedgerSnapshot, countBookingPendingPaymentProofs } from '@/src/roomOs/engines/ledger';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';

export type ResidentCertTarget = {
  bookingId: string;
  customerName: string;
  roomBed: string;
  bedId: string;
};

async function countPendingPaymentProofs(bookingId: string): Promise<number> {
  return countBookingPendingPaymentProofs(bookingId);
}

async function loadBookingFinancialAccount(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      bookingCode: bookings.bookingCode,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);

  if (!row) return null;
  return getBookingFinancialAccount(row);
}

export async function runBookingLedgerParityChecks(
  residents: ResidentCertTarget[],
  asOf: string,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  for (const resident of residents) {
    const [ledger, ssot, pendingProofCount] = await Promise.all([
      buildBookingLedgerSnapshot({ bookingId: resident.bookingId, asOf }),
      loadBookingFinancialAccount(resident.bookingId),
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
