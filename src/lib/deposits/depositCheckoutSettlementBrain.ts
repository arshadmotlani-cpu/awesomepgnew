/**
 * Deposit Brain — checkout settlement preview with full outstanding breakdown.
 */
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { dailyRateFromMonthly } from '@/src/services/billing';

export type DepositCheckoutSettlementBrainSnapshot = {
  bookingId: string;
  outstandingRentPaise: number;
  outstandingElectricityPaise: number;
  outstandingPenaltiesPaise: number;
  outstandingMiscPaise: number;
  lateFeePaise: number;
  alreadyPaidPaise: number;
  depositBalancePaise: number;
  electricityDeductFromDepositPaise: number;
  refundAmountPaise: number;
  remainingRecoverablePaise: number;
  electricityPending: boolean;
};

export async function buildDepositCheckoutSettlementBrain(input: {
  bookingId: string;
  monthlyRentPaise: number;
  stayCheckInDate: string;
  stayCheckoutDate: string;
  missingNoticeDays?: number;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  customChargePaise?: number;
}): Promise<DepositCheckoutSettlementBrainSnapshot> {
  const [balances, deposit, elecAccount, vacatingRes] = await Promise.all([
    getBookingMoneyBalances(input.bookingId),
    getDepositSummaryForBooking(input.bookingId),
    buildResidentElectricityAccount(input.bookingId),
    getVacatingForBooking(input.bookingId),
  ]);

  const outstandingRentPaise = balances?.rent.outstandingPaise ?? 0;
  const outstandingElectricityPaise = elecAccount.netOutstandingPaise;
  const lateFeePaise = elecAccount.lateFeePaise;
  const depositBalancePaise = Math.max(0, deposit?.refundableBalancePaise ?? 0);
  const alreadyPaidPaise =
    (balances?.rent.receivedPaise ?? 0) + (balances?.electricity.receivedPaise ?? 0);

  const miscPaise =
    (input.damageChargePaise ?? 0) +
    (input.cleaningChargePaise ?? 0) +
    (input.customChargePaise ?? 0);

  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: input.stayCheckInDate,
    stayCheckoutDate: input.stayCheckoutDate,
    rentPaidPaise: balances?.rent.receivedPaise ?? 0,
    monthlyRentPaise: input.monthlyRentPaise,
    depositCollectedPaise: depositBalancePaise,
    missingNoticeDays: input.missingNoticeDays ?? 0,
    electricityPaise: outstandingElectricityPaise,
    electricityDeductFromDeposit: outstandingElectricityPaise > 0,
    damageChargePaise: input.damageChargePaise,
    cleaningChargePaise: input.cleaningChargePaise,
    customChargePaise: input.customChargePaise,
    noticeApplies: vacatingRes.ok && vacatingRes.data != null,
  });

  const electricityDeductFromDepositPaise = Math.min(
    outstandingElectricityPaise,
    depositBalancePaise,
  );
  const refundAmountPaise = waterfall.refund.totalPaise;
  const totalOwed =
    outstandingRentPaise + outstandingElectricityPaise + lateFeePaise + miscPaise;
  const coveredByDeposit = depositBalancePaise + alreadyPaidPaise;
  const remainingRecoverablePaise = Math.max(0, totalOwed - coveredByDeposit);

  return {
    bookingId: input.bookingId,
    outstandingRentPaise,
    outstandingElectricityPaise,
    outstandingPenaltiesPaise: waterfall.notice.fullPaise,
    outstandingMiscPaise: miscPaise,
    lateFeePaise,
    alreadyPaidPaise,
    depositBalancePaise,
    electricityDeductFromDepositPaise,
    refundAmountPaise,
    remainingRecoverablePaise,
    electricityPending: outstandingElectricityPaise === 0 && elecAccount.invoices.length === 0,
  };
}

export { dailyRateFromMonthly };
