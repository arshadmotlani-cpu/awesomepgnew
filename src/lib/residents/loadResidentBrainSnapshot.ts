/**
 * Resident Brain — composes money + electricity SSOT for admin/customer surfaces.
 * No duplicate business logic; delegates to RFE and resident electricity account.
 */
import type { ResidentFinancialAccount } from '@/src/lib/billing/residentFinancialTypes';
import {
  buildResidentElectricityAccount,
  type ResidentElectricityAccountSnapshot,
} from '@/src/lib/residents/residentElectricityAccount';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';

export type ResidentBrainSnapshot = {
  customerId: string;
  financialAccount: ResidentFinancialAccount;
  electricityByBooking: Map<string, ResidentElectricityAccountSnapshot>;
};

export async function loadResidentBrainSnapshot(input: {
  customerId: string;
  bookingIds: string[];
  /** When caller already loaded RFE (e.g. resident account context), pass through. */
  financialAccount?: ResidentFinancialAccount | null;
}): Promise<ResidentBrainSnapshot | null> {
  const financialAccount =
    input.financialAccount ?? (await getResidentFinancialAccount(input.customerId));
  if (!financialAccount) return null;

  const electricityByBooking = new Map<string, ResidentElectricityAccountSnapshot>();
  const uniqueBookingIds = [...new Set(input.bookingIds.filter(Boolean))];
  await Promise.all(
    uniqueBookingIds.map(async (bookingId) => {
      const snapshot = await buildResidentElectricityAccount(bookingId);
      electricityByBooking.set(bookingId, snapshot);
    }),
  );

  return {
    customerId: input.customerId,
    financialAccount,
    electricityByBooking,
  };
}
