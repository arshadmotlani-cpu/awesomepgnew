/**
 * Consumption-month continuity — billing_month is the electricity consumption period.
 * Generation may occur in a later calendar month; meter baseline must be the
 * immediately preceding consumption month's close reading.
 */
import { parseDate, addMonths } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import type { FinalizedBillReadingRow } from '@/src/lib/billing/roomMeterReadingSsot';

export type ConsumptionMonthContinuityOk = {
  ok: true;
  isFirstConsumptionMonth: boolean;
  /** Prior consumption month whose close reading opens this bill (null when first month). */
  requiredBaselineMonth: string | null;
};

export type ConsumptionMonthContinuityBlocked = {
  ok: false;
  missingMonths: string[];
  requiredBaselineMonth: string;
  lastFinalizedMonth: string | null;
  message: string;
};

export type ConsumptionMonthContinuityAssessment =
  | ConsumptionMonthContinuityOk
  | ConsumptionMonthContinuityBlocked;

export function consumptionMonthLabel(billingMonth: string): string {
  const d = parseDate(firstOfMonth(billingMonth));
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Calendar month immediately before the target consumption month. */
export function previousConsumptionMonth(billingMonth: string): string {
  return firstOfMonth(addMonths(parseDate(firstOfMonth(billingMonth)), -1));
}

/**
 * Fail closed when the immediately preceding consumption month has no finalized bill.
 * First consumption month for a room (no prior bills) is allowed to bootstrap.
 */
export function assessConsumptionMonthContinuity(
  finalizedBills: FinalizedBillReadingRow[],
  targetBillingMonth: string,
): ConsumptionMonthContinuityAssessment {
  const target = firstOfMonth(targetBillingMonth);
  const priorBills = finalizedBills
    .filter((bill) => bill.billingMonth < target)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));

  if (priorBills.length === 0) {
    return { ok: true, isFirstConsumptionMonth: true, requiredBaselineMonth: null };
  }

  const requiredBaselineMonth = previousConsumptionMonth(target);
  const baselineBill = finalizedBills.find((bill) => bill.billingMonth === requiredBaselineMonth);
  const lastFinalizedMonth = priorBills[0]?.billingMonth ?? null;

  if (!baselineBill) {
    const targetLabel = consumptionMonthLabel(target);
    const requiredLabel = consumptionMonthLabel(requiredBaselineMonth);
    return {
      ok: false,
      missingMonths: [requiredBaselineMonth],
      requiredBaselineMonth,
      lastFinalizedMonth,
      message:
        `${targetLabel} electricity consumption cannot be generated because the previous required consumption period is missing. ` +
        `Generate ${requiredLabel} consumption first (opening baseline must be ${requiredLabel}'s predecessor close reading).`,
    };
  }

  return {
    ok: true,
    isFirstConsumptionMonth: false,
    requiredBaselineMonth,
  };
}

export function pickBaselineBillForConsumptionMonth(
  finalizedBills: FinalizedBillReadingRow[],
  targetBillingMonth: string,
): FinalizedBillReadingRow | null {
  const assessment = assessConsumptionMonthContinuity(finalizedBills, targetBillingMonth);
  if (!assessment.ok) return null;
  if (assessment.isFirstConsumptionMonth || !assessment.requiredBaselineMonth) return null;
  return (
    finalizedBills.find((bill) => bill.billingMonth === assessment.requiredBaselineMonth) ?? null
  );
}
