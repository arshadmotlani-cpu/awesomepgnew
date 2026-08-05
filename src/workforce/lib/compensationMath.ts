/**
 * Pure compensation helpers — salary / commission / incentives / performance.
 * DB writes live in compensation.ts services; math stays here for SSOT.
 */

export type CommissionType = 'none' | 'fixed' | 'percent';

export type CommissionConfig = {
  type: CommissionType;
  fixedPaise: number;
  /** Basis points: 1500 = 15% */
  percentBps: number;
};

export function normalizeCommissionType(raw: string | null | undefined): CommissionType {
  if (raw === 'fixed' || raw === 'percent') return raw;
  return 'none';
}

/** Commission on a sale amount (paise). Fixed ignores sale amount. */
export function computeCommissionPaise(
  config: CommissionConfig,
  saleAmountPaise: number,
): number {
  const sale = Math.max(0, Math.floor(saleAmountPaise));
  switch (config.type) {
    case 'fixed':
      return Math.max(0, Math.floor(config.fixedPaise));
    case 'percent': {
      const bps = Math.max(0, Math.floor(config.percentBps));
      return Math.floor((sale * bps) / 10_000);
    }
    default:
      return 0;
  }
}

export function payrollNetPaise(input: {
  salaryPaise: number;
  commissionPaise: number;
  incentivePaise: number;
  deductionsPaise: number;
}): number {
  return (
    Math.max(0, Math.floor(input.salaryPaise)) +
    Math.max(0, Math.floor(input.commissionPaise)) +
    Math.max(0, Math.floor(input.incentivePaise)) -
    Math.max(0, Math.floor(input.deductionsPaise))
  );
}

/** Progress toward a performance target (0–100, capped). */
export function performanceProgressPercent(actualPaise: number, targetPaise: number): number {
  if (targetPaise <= 0) return 0;
  return Math.min(100, Math.floor((Math.max(0, actualPaise) * 100) / targetPaise));
}
