/**
 * Loads room occupancy timeline and builds checkout electricity allocation.
 */
import { formatDate, parseDate } from '@/src/lib/dates';
import {
  allocateRoomElectricityCheckout,
  type RoomElectricityCheckoutAllocation,
  type RoomOccupantSlice,
} from '@/src/lib/checkout/roomElectricityAllocation';
import { loadHistoricalRoomOccupantSlicesForPeriod } from '@/src/lib/billing/roomElectricityCheckoutOccupants';
import { firstOfMonth, monthBounds } from '@/src/services/billing';

export type { RoomElectricityCheckoutAllocation };

/** Historical room occupancy for checkout — same SSOT as monthly electricity billing. */
export async function loadRoomOccupantsForBillingPeriod(
  roomId: string,
  periodStart: string,
  periodEndExclusive: string,
): Promise<RoomOccupantSlice[]> {
  return loadHistoricalRoomOccupantSlicesForPeriod({
    roomId,
    periodStart,
    periodEndExclusive,
  });
}

export type RoomElectricityCollectionRow = {
  customerId: string;
  amountPaise: number;
  checkoutSettlementId?: string | null;
};

/** Build per-customer collected map — SSOT for checkout electricity remaining pool. */
export function buildCollectedByCustomerIdForCheckout(input: {
  contributions: RoomElectricityCollectionRow[];
  ledgerRows: RoomElectricityCollectionRow[];
  excludeCheckoutSettlementId?: string | null;
}): Map<string, number> {
  const collectedByCustomerId = new Map<string, number>();
  if (input.contributions.length > 0) {
    for (const row of input.contributions) {
      if (
        input.excludeCheckoutSettlementId &&
        row.checkoutSettlementId === input.excludeCheckoutSettlementId
      ) {
        continue;
      }
      collectedByCustomerId.set(
        row.customerId,
        (collectedByCustomerId.get(row.customerId) ?? 0) + row.amountPaise,
      );
    }
    return collectedByCustomerId;
  }

  for (const entry of input.ledgerRows) {
    if (
      input.excludeCheckoutSettlementId &&
      entry.checkoutSettlementId === input.excludeCheckoutSettlementId
    ) {
      continue;
    }
    collectedByCustomerId.set(
      entry.customerId,
      (collectedByCustomerId.get(entry.customerId) ?? 0) + entry.amountPaise,
    );
  }
  return collectedByCustomerId;
}

export async function buildRoomElectricityCheckoutAllocation(input: {
  roomId: string;
  customerId: string;
  vacatingDate: string;
  totalBillPaise: number;
  unitsConsumed?: number | null;
  excludeCheckoutSettlementId?: string | null;
}): Promise<RoomElectricityCheckoutAllocation> {
  const billingMonth = firstOfMonth(input.vacatingDate);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const vacatingExclusive = formatDate(
    new Date(parseDate(input.vacatingDate).getTime() + 86_400_000),
  );
  const periodEndExclusive =
    vacatingExclusive < formatDate(monthEnd) ? vacatingExclusive : formatDate(monthEnd);
  const periodStart = formatDate(monthStart);

  const occupants = await loadRoomOccupantsForBillingPeriod(
    input.roomId,
    periodStart,
    periodEndExclusive,
  );

  const { loadRoomElectricityCollectedByCustomerForMonth } = await import(
    '@/src/services/electricityRoomContributions'
  );
  const collectedByCustomerId = await loadRoomElectricityCollectedByCustomerForMonth(
    input.roomId,
    billingMonth,
    { excludeCheckoutSettlementId: input.excludeCheckoutSettlementId },
  );

  return allocateRoomElectricityCheckout({
    billingMonth,
    periodStart,
    periodEndExclusive,
    totalBillPaise: input.totalBillPaise,
    unitsConsumed: input.unitsConsumed ?? null,
    occupants,
    collectedByCustomerId,
    currentCustomerId: input.customerId,
  });
}
