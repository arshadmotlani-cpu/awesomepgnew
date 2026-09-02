/**
 * Gate: unexplained electricity financial rows must never commit.
 * Pure validation — no DB.
 */
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';

export class ElectricityBreakdownCommitError extends Error {
  readonly code = 'breakdown_commit_invalid' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ElectricityBreakdownCommitError';
  }
}

export function assertElectricityBreakdownCommitReady(input: {
  breakdown: ElectricityBillCalculationBreakdown;
  grossTotalPaise: number;
  invoiceTotalPaise: number;
}): void {
  const { breakdown, grossTotalPaise, invoiceTotalPaise } = input;

  if (!breakdown || typeof breakdown !== 'object') {
    throw new ElectricityBreakdownCommitError('Calculation breakdown is missing.');
  }
  if (breakdown.version !== 1 && breakdown.version !== 2) {
    throw new ElectricityBreakdownCommitError('Calculation breakdown version is unsupported.');
  }
  if (!breakdown.meter || !Number.isFinite(breakdown.meter.grossTotalPaise)) {
    throw new ElectricityBreakdownCommitError('Calculation breakdown meter totals are incomplete.');
  }
  if (breakdown.meter.grossTotalPaise !== grossTotalPaise) {
    throw new ElectricityBreakdownCommitError(
      `Breakdown gross ${breakdown.meter.grossTotalPaise} does not match bill gross ${grossTotalPaise}.`,
    );
  }
  if (!Array.isArray(breakdown.timeline)) {
    throw new ElectricityBreakdownCommitError('Calculation breakdown timeline is missing.');
  }

  if (breakdown.conservation) {
    if (breakdown.conservation.invoiceTotalPaise !== invoiceTotalPaise) {
      throw new ElectricityBreakdownCommitError(
        `Breakdown invoice total ${breakdown.conservation.invoiceTotalPaise} does not match allocated invoices ${invoiceTotalPaise}.`,
      );
    }
    if (breakdown.conservation.accountedTotalPaise !== grossTotalPaise) {
      throw new ElectricityBreakdownCommitError(
        `Breakdown conservation ${breakdown.conservation.accountedTotalPaise} does not equal room gross ${grossTotalPaise}.`,
      );
    }
  } else if (breakdown.version === 2) {
    throw new ElectricityBreakdownCommitError('v2 breakdown is missing conservation totals.');
  }

  if (!breakdown.generatedAt) {
    throw new ElectricityBreakdownCommitError('Calculation breakdown generatedAt is missing.');
  }
}
