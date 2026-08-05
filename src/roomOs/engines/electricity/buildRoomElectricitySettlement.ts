/**
 * Room Brain — live electricity settlement totals per room/month.
 * SSOT: electricitySettlementLedgerView + room electricity ledger.
 */
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { firstOfMonth } from '@/src/services/billing';

export type RoomElectricityResidentSettlementRow = {
  customerId: string;
  customerName: string;
  bookingId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amountOwedPaise: number;
  amountPaidPaise: number;
  amountDeductedFromDepositPaise: number;
  outstandingPaise: number;
  lateFeePaise: number;
  status: 'settled' | 'pending' | 'excluded_checkout';
  lateFeeWaived: boolean;
};

export type RoomElectricitySettlementSnapshot = {
  roomId: string;
  roomNumber: string;
  pgName: string;
  billingMonth: string;
  electricityBillId: string | null;
  totalRoomBillPaise: number;
  grossRoomBillPaise: number;
  checkoutCreditsPaise: number;
  prepaidCreditsPaise: number;
  alreadyCollectedPaise: number;
  collectedFromDepositsPaise: number;
  pendingCollectionPaise: number;
  reconciliationGapPaise: number;
  isBalanced: boolean;
  residentsSettled: RoomElectricityResidentSettlementRow[];
  residentsPending: RoomElectricityResidentSettlementRow[];
};

export async function buildRoomElectricitySettlementSnapshot(input: {
  roomId: string;
  billingMonth?: string;
}): Promise<RoomElectricitySettlementSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? new Date());
  const ledger = await getElectricitySettlementLedgerView({
    roomId: input.roomId,
    billingMonth,
  });

  if (!ledger) return null;

  if (!ledger.electricityBillId && ledger.totalRoomBillPaise <= 0) {
    return null;
  }

  const depositCollectedPaise = ledger.checkoutSettlementTotalPaise;

  const residentsSettled: RoomElectricityResidentSettlementRow[] = [];
  const residentsPending: RoomElectricityResidentSettlementRow[] = [];

  for (const alloc of ledger.residentAllocations) {
    const outstanding = Math.max(0, alloc.amountPaise - alloc.paidPaise);
    const row: RoomElectricityResidentSettlementRow = {
      customerId: alloc.customerId,
      customerName: alloc.customerName,
      bookingId: alloc.bookingId,
      invoiceId: alloc.invoiceId,
      invoiceNumber: alloc.invoiceNumber,
      amountOwedPaise: alloc.amountPaise,
      amountPaidPaise: alloc.paidPaise,
      amountDeductedFromDepositPaise: alloc.excludedBecauseCheckoutPaid ? alloc.paidPaise : 0,
      outstandingPaise: outstanding,
      lateFeePaise: 0,
      status:
        outstanding <= 0
          ? 'settled'
          : alloc.excludedBecauseCheckoutPaid
            ? 'excluded_checkout'
            : 'pending',
      lateFeeWaived: false,
    };
    if (outstanding <= 0) residentsSettled.push(row);
    else residentsPending.push(row);
  }

  return {
    roomId: ledger.roomId,
    roomNumber: ledger.roomNumber,
    pgName: ledger.pgName,
    billingMonth: ledger.billingMonth,
    electricityBillId: ledger.electricityBillId,
    totalRoomBillPaise: ledger.remainingRoomBalancePaise + ledger.collectedPaise,
    grossRoomBillPaise: ledger.totalRoomBillPaise,
    checkoutCreditsPaise: ledger.checkoutSettlementTotalPaise,
    prepaidCreditsPaise: ledger.prepaidCreditAppliedPaise,
    alreadyCollectedPaise: ledger.collectedPaise,
    collectedFromDepositsPaise: depositCollectedPaise,
    pendingCollectionPaise: ledger.outstandingPaise,
    reconciliationGapPaise: ledger.reconciliationGapPaise,
    isBalanced: ledger.isBalanced,
    residentsSettled,
    residentsPending,
  };
}
