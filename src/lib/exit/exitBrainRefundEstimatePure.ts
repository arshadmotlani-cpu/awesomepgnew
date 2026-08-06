/**
 * Pure refund estimate composition — no DB, no duplicate settlement math.
 */
import type {
  ExitElectricityEstimated,
  ExitElectricityGenerated,
  ExitRefundEstimate,
  ExitRefundEstimateLine,
} from '@/src/lib/exit/exitBrainTypes';

export function buildExitRefundEstimate(input: {
  depositHeldPaise: number;
  pendingRentPrincipalPaise: number;
  frozenRentLateFeePaise: number;
  frozenNoticePenaltyPaise: number;
  electricityGenerated: ExitElectricityGenerated | null;
  electricityEstimated: ExitElectricityEstimated;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  otherChargePaise?: number;
}): ExitRefundEstimate {
  const lines: ExitRefundEstimateLine[] = [];

  lines.push({
    key: 'deposit_held',
    label: 'Deposit',
    amountPaise: input.depositHeldPaise,
  });

  if (input.pendingRentPrincipalPaise > 0) {
    lines.push({
      key: 'pending_rent',
      label: 'Pending Rent',
      amountPaise: -input.pendingRentPrincipalPaise,
    });
  }

  if (input.frozenNoticePenaltyPaise > 0) {
    lines.push({
      key: 'notice_penalty',
      label: 'Notice Penalty',
      amountPaise: -input.frozenNoticePenaltyPaise,
    });
  }

  if (input.electricityGenerated && input.electricityGenerated.outstandingPaise > 0) {
    lines.push({
      key: 'pending_electricity_invoice',
      label: 'Pending Electricity Invoice',
      amountPaise: -input.electricityGenerated.outstandingPaise,
    });
  }

  const estimatedElecShare = input.electricityEstimated.residentSharePaise ?? 0;
  if (estimatedElecShare > 0) {
    lines.push({
      key: 'estimated_checkout_electricity',
      label: 'Estimated Final Electricity',
      amountPaise: -estimatedElecShare,
    });
  } else if (input.electricityEstimated.pending) {
    lines.push({
      key: 'estimated_checkout_electricity',
      label: 'Estimated Final Electricity',
      amountPaise: 0,
    });
  }

  if (input.frozenRentLateFeePaise > 0) {
    lines.push({
      key: 'frozen_late_fee',
      label: 'Late Fee (Frozen)',
      amountPaise: -input.frozenRentLateFeePaise,
    });
  }

  const damage = input.damageChargePaise ?? 0;
  const cleaning = input.cleaningChargePaise ?? 0;
  const other = input.otherChargePaise ?? 0;

  if (damage > 0) {
    lines.push({ key: 'damage_charges', label: 'Damage Charges', amountPaise: -damage });
  }
  if (cleaning > 0) {
    lines.push({ key: 'cleaning_charges', label: 'Cleaning Charges', amountPaise: -cleaning });
  }
  if (other > 0) {
    lines.push({ key: 'other_charges', label: 'Other Charges', amountPaise: -other });
  }

  const deductions = Math.abs(
    lines
      .filter((l) => l.key !== 'deposit_held')
      .reduce((sum, l) => sum + (l.amountPaise < 0 ? l.amountPaise : 0), 0),
  );

  const estimatedRefundPaise = input.depositHeldPaise - deductions;

  lines.push({
    key: 'estimated_refund',
    label: 'Estimated Refund',
    amountPaise: estimatedRefundPaise,
  });

  return {
    lines,
    estimatedRefundPaise,
    depositHeldPaise: input.depositHeldPaise,
    disclaimer:
      'This is an estimate. Final refund is confirmed after checkout meter reading and admin settlement.',
    confidencePercent: 100,
    confidenceReasons: [],
  };
}

export function mapElectricityInvoiceStatus(input: {
  outstandingPaise: number;
  paidPaise: number;
  deductedFromDepositPaise: number;
}): ExitElectricityGenerated['status'] {
  if (input.deductedFromDepositPaise > 0 && input.outstandingPaise <= 0) {
    return 'Recovered from Deposit';
  }
  if (input.outstandingPaise <= 0 && input.paidPaise > 0) return 'Paid';
  if (input.outstandingPaise > 0) return 'Pending';
  return 'Waived';
}
