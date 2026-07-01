import { billingDayFromMoveIn } from '@/src/services/billing';
import { titleCase } from '@/src/lib/format';

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
  if (input.checkoutStatus === 'paid' || input.checkoutStatus === 'completed') {
    return 'Completed';
  }
  if (input.vacatingStatus === 'approved') return 'Approved — awaiting vacate date';
  if (input.vacatingStatus === 'pending') return 'Notice submitted — under review';
  if (input.vacatingStatus === 'completed') return 'Move-out completed';
  if (input.vacatingStatus === 'rejected') return 'Notice declined';
  return 'Not started';
}

export function enrichBillDueRow(
  row: import('@/src/components/customer/account/resident/ResidentPaymentsPanel').PaymentDueRow,
): import('@/src/components/customer/account/resident/ResidentPaymentsV2Hub').BillDueRow {
  const label = row.label.toLowerCase();
  if (label.startsWith('rent')) {
    return {
      ...row,
      kind: 'rent',
      why: 'Monthly rent for your current bed.',
      calc: `${row.label} · billed on your move-in anniversary cycle`,
    };
  }
  if (label.includes('electricity') || label.startsWith('elec')) {
    return {
      ...row,
      kind: 'electricity',
      why: 'Your share of the room electricity meter.',
      calc: 'Split equally among active room occupants for the billing month.',
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
