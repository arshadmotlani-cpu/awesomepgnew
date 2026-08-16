import { pgEnum } from 'drizzle-orm/pg-core';

export const ooSourceSystemEnum = pgEnum('oo_source_system', [
  'OWNER_OS',
  'AWESOME_PG',
  'FYHAIR',
  'CAPITAL',
  'WORKFORCE',
  'OTHER',
]);

export const ooEconomicEventTypeEnum = pgEnum('oo_economic_event_type', [
  'INCOME',
  'EXPENSE',
  'ASSET_PURCHASE',
  'LIABILITY_PAYMENT',
  'TRANSFER',
  'VALUATION_ADJUSTMENT',
  'LIABILITY_ACCRUAL',
  'OPENING_BALANCE',
]);

export const ooAssetTypeEnum = pgEnum('oo_asset_type', [
  'CASH',
  'BANK',
  'PROPERTY',
  'INVESTMENT_LINK',
  'VEHICLE_LINK',
  'BUSINESS_INTEREST',
  'OTHER',
]);

export const ooLiabilityTypeEnum = pgEnum('oo_liability_type', [
  'EMI',
  'INTEREST_ONLY',
  'DAILY_INTEREST',
  'MONTHLY_INTEREST',
  'FIXED_SCHEDULE',
  'CUSTOM',
]);

export const ooPaymentAllocationModeEnum = pgEnum('oo_payment_allocation_mode', ['AUTO', 'MANUAL']);

export const ooIntegrationFactKindEnum = pgEnum('oo_integration_fact_kind', [
  'REVENUE',
  'EXPENSE',
  'PROFIT',
  'ASSET_VALUE',
  'LIABILITY',
  'OTHER',
]);

export const ooValuationKindEnum = pgEnum('oo_valuation_kind', [
  'ACTUAL',
  'APPRAISAL',
  'MARKET_ESTIMATE',
  'PROJECTED',
]);

export const ooScheduleStatusEnum = pgEnum('oo_schedule_status', [
  'UPCOMING',
  'DUE',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'SKIPPED',
]);

export const ooExpenseCategoryEnum = pgEnum('oo_expense_category', [
  'PERSONAL',
  'PROPERTY',
  'BUSINESS',
  'INVESTMENT',
  'LOAN_INTEREST',
  'TAXES',
  'REPAIRS',
  'MAINTENANCE',
  'OTHER',
]);

export const ooRecurringFrequencyEnum = pgEnum('oo_recurring_frequency', [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);
