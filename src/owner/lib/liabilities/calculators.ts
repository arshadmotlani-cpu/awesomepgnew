import type { LiabilityType } from '@/src/owner/lib/wealth/types';

export type LiabilityContext = {
  id: string;
  liabilityType: LiabilityType;
  currentPrincipalPaise: number;
  originalPrincipalPaise: number;
  interestRateBps: number;
  accruedInterestPaise: number;
  lastAccrualDate?: string | null;
  startDate?: string | null;
  tenureMonths?: number | null;
  fixedPaymentPaise?: number | null;
  repaymentFrequency?: string | null;
  rulesJson?: Record<string, unknown>;
};

export type AccrualResult = {
  accruedInterestPaise: number;
  daysAccrued: number;
  asOfDate: string;
};

export type DueResult = {
  principalDuePaise: number;
  interestDuePaise: number;
  totalDuePaise: number;
  dueDate: string | null;
  nextDueDate: string | null;
  overduePaise: number;
};

export type PaymentAllocation = {
  interestPaise: number;
  principalPaise: number;
  surplusPrincipalPaise: number;
  remainingAccruedPaise: number;
};

export type LiabilityCalculator = {
  type: LiabilityType;
  accrueInterest(ctx: LiabilityContext, asOfDate: string): AccrualResult;
  getDue(ctx: LiabilityContext, asOfDate: string): DueResult;
  allocatePayment(
    ctx: LiabilityContext,
    amountPaise: number,
    asOfDate: string,
    mode?: 'AUTO' | 'MANUAL',
    manual?: { interestPaise: number; principalPaise: number },
  ): PaymentAllocation;
};

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

function dailyInterestPaise(principalPaise: number, rateBps: number): number {
  const dailyRate = rateBps / 10000 / 365;
  return Math.round(principalPaise * dailyRate);
}

function monthlyInterestPaise(principalPaise: number, rateBps: number): number {
  const monthlyRate = rateBps / 10000 / 12;
  return Math.round(principalPaise * monthlyRate);
}

function emiPaise(principalPaise: number, rateBps: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return principalPaise;
  const r = rateBps / 10000 / 12;
  if (r === 0) return Math.round(principalPaise / tenureMonths);
  const factor = Math.pow(1 + r, tenureMonths);
  return Math.round((principalPaise * r * factor) / (factor - 1));
}

const dailyInterestCalc: LiabilityCalculator = {
  type: 'DAILY_INTEREST',
  accrueInterest(ctx, asOfDate) {
    const from = ctx.lastAccrualDate ?? ctx.startDate ?? asOfDate;
    const days = daysBetween(from, asOfDate);
    const daily = dailyInterestPaise(ctx.currentPrincipalPaise, ctx.interestRateBps);
    return {
      accruedInterestPaise: ctx.accruedInterestPaise + daily * days,
      daysAccrued: days,
      asOfDate,
    };
  },
  getDue(ctx, asOfDate) {
    const accrual = this.accrueInterest(ctx, asOfDate);
    return {
      principalDuePaise: 0,
      interestDuePaise: accrual.accruedInterestPaise,
      totalDuePaise: accrual.accruedInterestPaise,
      dueDate: asOfDate,
      nextDueDate: asOfDate,
      overduePaise:
        ctx.lastAccrualDate && ctx.lastAccrualDate < asOfDate ? accrual.accruedInterestPaise : 0,
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    const due = this.getDue(ctx, asOfDate);
    if (mode === 'MANUAL' && manual) {
      return {
        interestPaise: manual.interestPaise,
        principalPaise: manual.principalPaise,
        surplusPrincipalPaise: Math.max(
          0,
          amountPaise - manual.interestPaise - manual.principalPaise,
        ),
        remainingAccruedPaise: Math.max(0, due.interestDuePaise - manual.interestPaise),
      };
    }
    const interestPaise = Math.min(amountPaise, due.interestDuePaise);
    const remainder = amountPaise - interestPaise;
    const principalPaise = Math.min(remainder, ctx.currentPrincipalPaise);
    return {
      interestPaise,
      principalPaise,
      surplusPrincipalPaise: Math.max(0, remainder - principalPaise),
      remainingAccruedPaise: Math.max(0, due.interestDuePaise - interestPaise),
    };
  },
};

const monthlyInterestCalc: LiabilityCalculator = {
  type: 'MONTHLY_INTEREST',
  accrueInterest(ctx, asOfDate) {
    const from = ctx.lastAccrualDate ?? ctx.startDate ?? asOfDate;
    const days = daysBetween(from, asOfDate);
    const monthly = monthlyInterestPaise(ctx.currentPrincipalPaise, ctx.interestRateBps);
    const accrued = Math.round((monthly * days) / 30);
    return {
      accruedInterestPaise: ctx.accruedInterestPaise + accrued,
      daysAccrued: days,
      asOfDate,
    };
  },
  getDue(ctx, asOfDate) {
    const accrual = this.accrueInterest(ctx, asOfDate);
    return {
      principalDuePaise: 0,
      interestDuePaise: accrual.accruedInterestPaise,
      totalDuePaise: accrual.accruedInterestPaise,
      dueDate: asOfDate,
      nextDueDate: asOfDate,
      overduePaise: accrual.accruedInterestPaise,
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    return dailyInterestCalc.allocatePayment(ctx, amountPaise, asOfDate, mode, manual);
  },
};

const interestOnlyCalc: LiabilityCalculator = {
  type: 'INTEREST_ONLY',
  accrueInterest(ctx, asOfDate) {
    return monthlyInterestCalc.accrueInterest(ctx, asOfDate);
  },
  getDue(ctx, asOfDate) {
    const accrual = this.accrueInterest(ctx, asOfDate);
    return {
      principalDuePaise: 0,
      interestDuePaise: accrual.accruedInterestPaise,
      totalDuePaise: accrual.accruedInterestPaise,
      dueDate: ctx.startDate ?? asOfDate,
      nextDueDate: asOfDate,
      overduePaise: accrual.accruedInterestPaise,
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    return dailyInterestCalc.allocatePayment(ctx, amountPaise, asOfDate, mode, manual);
  },
};

const emiCalc: LiabilityCalculator = {
  type: 'EMI',
  accrueInterest(ctx, asOfDate) {
    return monthlyInterestCalc.accrueInterest(ctx, asOfDate);
  },
  getDue(ctx, asOfDate) {
    const tenure = ctx.tenureMonths ?? 12;
    const emi =
      ctx.fixedPaymentPaise ??
      emiPaise(ctx.originalPrincipalPaise, ctx.interestRateBps, tenure);
    const interestDue = monthlyInterestPaise(ctx.currentPrincipalPaise, ctx.interestRateBps);
    const principalDue = Math.max(0, emi - interestDue);
    return {
      principalDuePaise: principalDue,
      interestDuePaise: interestDue,
      totalDuePaise: emi,
      dueDate: asOfDate,
      nextDueDate: asOfDate,
      overduePaise: 0,
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    const due = this.getDue(ctx, asOfDate);
    if (mode === 'MANUAL' && manual) {
      return {
        interestPaise: manual.interestPaise,
        principalPaise: manual.principalPaise,
        surplusPrincipalPaise: Math.max(
          0,
          amountPaise - manual.interestPaise - manual.principalPaise,
        ),
        remainingAccruedPaise: 0,
      };
    }
    const interestPaise = Math.min(amountPaise, due.interestDuePaise);
    const remainder = amountPaise - interestPaise;
    const principalPaise = Math.min(remainder, ctx.currentPrincipalPaise);
    return {
      interestPaise,
      principalPaise,
      surplusPrincipalPaise: Math.max(0, remainder - principalPaise),
      remainingAccruedPaise: 0,
    };
  },
};

const fixedScheduleCalc: LiabilityCalculator = {
  type: 'FIXED_SCHEDULE',
  accrueInterest(ctx, asOfDate) {
    return dailyInterestCalc.accrueInterest(ctx, asOfDate);
  },
  getDue(ctx, asOfDate) {
    const fixed = ctx.fixedPaymentPaise ?? 0;
    return {
      principalDuePaise: Math.min(fixed, ctx.currentPrincipalPaise),
      interestDuePaise: 0,
      totalDuePaise: fixed,
      dueDate: asOfDate,
      nextDueDate: asOfDate,
      overduePaise: 0,
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    return dailyInterestCalc.allocatePayment(ctx, amountPaise, asOfDate, mode, manual);
  },
};

const customCalc: LiabilityCalculator = {
  type: 'CUSTOM',
  accrueInterest(ctx, asOfDate) {
    return dailyInterestCalc.accrueInterest(ctx, asOfDate);
  },
  getDue(ctx, asOfDate) {
    const rules = ctx.rulesJson ?? {};
    const principalDue = Number(rules.principalDuePaise ?? 0);
    const interestDue = Number(rules.interestDuePaise ?? ctx.accruedInterestPaise);
    return {
      principalDuePaise: principalDue,
      interestDuePaise: interestDue,
      totalDuePaise: principalDue + interestDue,
      dueDate: (rules.dueDate as string) ?? asOfDate,
      nextDueDate: (rules.nextDueDate as string) ?? asOfDate,
      overduePaise: Number(rules.overduePaise ?? 0),
    };
  },
  allocatePayment(ctx, amountPaise, asOfDate, mode, manual) {
    return dailyInterestCalc.allocatePayment(ctx, amountPaise, asOfDate, mode, manual);
  },
};

export const LIABILITY_CALCULATORS: Record<LiabilityType, LiabilityCalculator> = {
  EMI: emiCalc,
  INTEREST_ONLY: interestOnlyCalc,
  DAILY_INTEREST: dailyInterestCalc,
  MONTHLY_INTEREST: monthlyInterestCalc,
  FIXED_SCHEDULE: fixedScheduleCalc,
  CUSTOM: customCalc,
};

export function getLiabilityCalculator(type: LiabilityType): LiabilityCalculator {
  return LIABILITY_CALCULATORS[type];
}
