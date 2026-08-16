import { billingDayFromMoveIn } from '@/src/services/billing';
import { titleCase } from '@/src/lib/format';
import { residentMoveOutChipLabel } from '@/src/lib/residents/vacatingPresentation';

export function billingCycleLabel(moveInDate: string): string {
  const day = billingDayFromMoveIn(moveInDate);
  const suffix =
    day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : day <= 20 ? 'th' : 'th';
  return `${day}${suffix} of each month`;
}

export function moveOutStatusLabel(input: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
}): string {
  return residentMoveOutChipLabel(input);
}

export function enrichBillDueRow(
  row: import('@/src/components/customer/account/resident/ResidentPaymentsPanel').PaymentDueRow,
): import('@/src/components/customer/account/resident/ResidentPaymentsV2Hub').BillDueRow {
  if (row.key.startsWith('rent-')) {
    const periodCopy = row.billingPeriodLine ?? row.billingPeriodLabel;
    return {
      ...row,
      kind: 'rent',
      why: row.transitionExplanation ?? undefined,
      calc: periodCopy
        ? `${periodCopy}. Your payment on the due date covers your stay for this period.`
        : 'Monthly rent for your current bed.',
    };
  }
  const label = row.label.toLowerCase();
  if (label.includes('electricity') || label.startsWith('elec')) {
    const useProRata = row.electricityUseProRata === true;
    return {
      ...row,
      kind: 'electricity',
      why: 'Your share of the room electricity meter.',
      calc: useProRata
        ? 'This electricity bill has been calculated based on your stay duration, occupancy during the billing cycle, and your allocated share of room electricity.'
        : 'Split equally among active room occupants for the billing month.',
    };
  }
  if (label.includes('deposit')) {
    return {
      ...row,
      kind: 'deposit',
      why: 'Security deposit required before or during your stay.',
      calc: 'Per Awesome PG deposit policy for your stay type.',
    };
  }
  if (label.includes('penalty') || label.includes('shift')) {
    return {
      ...row,
      kind: 'penalty',
      why: 'Administrative or policy charge.',
      calc: row.invoiceNumber ? `Invoice ${row.invoiceNumber}` : 'See invoice for breakdown.',
    };
  }
  return {
    ...row,
    kind: 'other',
    why: 'Charge on your account.',
    calc: titleCase(row.status),
  };
}
