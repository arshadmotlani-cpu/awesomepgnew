/**
 * Authoritative room electricity gross bill for checkout allocation.
 * Prefers finalized monthly electricity_bills over ad-hoc meter math on the settlement row.
 */
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { firstOfMonth } from '@/src/services/billing';

export type CheckoutRoomElectricityBillSource = 'electricity_bill' | 'meter_reading';

export async function resolveAuthoritativeRoomElectricityBillPaiseForCheckout(input: {
  roomId: string;
  vacatingDate: string;
  meterDerivedTotalPaise: number;
}): Promise<{ totalBillPaise: number; source: CheckoutRoomElectricityBillSource }> {
  const billingMonth = firstOfMonth(input.vacatingDate);
  const ledger = await getElectricitySettlementLedgerView({
    roomId: input.roomId,
    billingMonth,
    fallbackTotalBillPaise: input.meterDerivedTotalPaise,
  });
  if (ledger?.electricityBillId && ledger.totalRoomBillPaise > 0) {
    return { totalBillPaise: ledger.totalRoomBillPaise, source: 'electricity_bill' };
  }
  return {
    totalBillPaise: Math.max(0, input.meterDerivedTotalPaise),
    source: 'meter_reading',
  };
}
