/**
 * RFE ↔ Room OS bridge — Wave 3.
 * Routes booking-scoped money totals through Bed Brain → LedgerProjection.
 */

import { buildBookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import { loadLedger } from '@/src/roomOs/api/v1/roomOs';
import type { BookingLedgerSnapshot } from '@/src/roomOs/types';
import type {
  ResidentFinancialCategory,
  ResidentFinancialSummary,
  ResidentFinancialTotals,
} from '@/src/lib/billing/residentFinancialTypes';

function ledgerCategoryToResidentCategory(
  slice: BookingLedgerSnapshot['rent'],
): ResidentFinancialCategory {
  return {
    requiredPaise: slice.requiredPaise,
    paidPaise: slice.receivedPaise,
    outstandingPaise: slice.outstandingPaise,
    items: [],
  };
}

/** Apply LedgerProjection totals onto an RFE summary (line items preserved). */
export function applyLedgerTotalsToSummary(
  summary: ResidentFinancialSummary,
  ledger: BookingLedgerSnapshot,
): ResidentFinancialSummary {
  const rent = ledgerCategoryToResidentCategory(ledger.rent);
  const electricity = ledgerCategoryToResidentCategory(ledger.electricity);
  const deposit = {
    ...ledgerCategoryToResidentCategory(ledger.deposit),
    refundablePaise: ledger.deposit.refundablePaise,
  };

  const totals: ResidentFinancialTotals = {
    requiredPaise: ledger.totals.requiredPaise,
    paidPaise: ledger.totals.receivedPaise,
    outstandingPaise: ledger.totals.outstandingPaise,
  };

  return {
    ...summary,
    rent: { ...summary.rent, ...rent, items: summary.rent.items },
    electricity: { ...summary.electricity, ...electricity, items: summary.electricity.items },
    deposit: { ...summary.deposit, ...deposit, items: summary.deposit.items },
    totals,
  };
}

/** Load booking financial totals via Bed Brain → LedgerProjection (Wave 3 read path). */
export async function loadBookingTotalsViaBedBrain(input: {
  bookingId: string;
  asOf?: string;
}): Promise<BookingLedgerSnapshot | null> {
  const context = await buildBookingContextSnapshot({
    bookingId: input.bookingId,
    asOf: input.asOf,
  });
  if (context?.ledger) return context.ledger;

  const ledgerResult = await loadLedger({
    bookingId: input.bookingId,
    asOf: input.asOf,
  });
  return ledgerResult.snapshot;
}
