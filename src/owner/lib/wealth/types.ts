/** Shared wealth OS types and helpers. */
import { coerceWealthBps, coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export type SourceSystem =
  | 'OWNER_OS'
  | 'AWESOME_PG'
  | 'FYHAIR'
  | 'CAPITAL'
  | 'WORKFORCE'
  | 'OTHER';

export type EconomicEventType =
  | 'INCOME'
  | 'EXPENSE'
  | 'ASSET_PURCHASE'
  | 'LIABILITY_PAYMENT'
  | 'TRANSFER'
  | 'VALUATION_ADJUSTMENT'
  | 'LIABILITY_ACCRUAL'
  | 'OPENING_BALANCE';

export type ExpenseCategory =
  | 'PERSONAL'
  | 'PROPERTY'
  | 'BUSINESS'
  | 'INVESTMENT'
  | 'LOAN_INTEREST'
  | 'TAXES'
  | 'REPAIRS'
  | 'MAINTENANCE'
  | 'OTHER';

export type LiabilityType =
  | 'EMI'
  | 'INTEREST_ONLY'
  | 'DAILY_INTEREST'
  | 'MONTHLY_INTEREST'
  | 'FIXED_SCHEDULE'
  | 'CUSTOM';

export type ValuationKind = 'ACTUAL' | 'APPRAISAL' | 'MARKET_ESTIMATE' | 'PROJECTED';

export type IntegrationFactKind =
  | 'REVENUE'
  | 'EXPENSE'
  | 'PROFIT'
  | 'ASSET_VALUE'
  | 'LIABILITY'
  | 'OTHER';

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'lifetime';

export function ownershipSharePaise(valuePaise: unknown, ownershipPctBps: unknown): number {
  const value = coerceWealthPaise(valuePaise);
  const bps = coerceWealthBps(ownershipPctBps);
  return Math.round((value * bps) / 10000);
}

export function paiseFromRupees(rupees: number): number {
  return Math.round(rupees * 100);
}

export function rupeesFromPaise(paise: number): number {
  return paise / 100;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function periodBounds(period: PeriodKey, asOf = todayIsoDate()): {
  start: string;
  end: string;
} {
  const end = new Date(`${asOf}T12:00:00`);
  const start = new Date(end);

  switch (period) {
    case 'today':
      break;
    case 'week':
      start.setDate(start.getDate() - 6);
      break;
    case 'month':
      start.setDate(1);
      break;
    case 'quarter':
      start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
      break;
    case 'year':
      start.setMonth(0, 1);
      break;
    case 'lifetime':
      return { start: '1970-01-01', end: asOf };
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: asOf,
  };
}
