import { pgEnum } from 'drizzle-orm/pg-core';

export const assetClassEnum = pgEnum('ac_asset_class', [
  'automotive',
  'property',
  'gold',
  'machinery',
  'business',
  'loan',
]);

export const assetStatusEnum = pgEnum('ac_asset_status', [
  'purchased',
  'repairing',
  'painting',
  'ready',
  'listed',
  'sold',
  'settled',
  'cancelled',
]);

export const paymentTypeEnum = pgEnum('ac_payment_type', [
  'capital_returned',
  'profit',
  'adjustment',
  'refund',
]);

export const paymentModeEnum = pgEnum('ac_payment_mode', [
  'cash',
  'upi',
  'neft',
  'rtgs',
  'cheque',
  'bank',
]);

export const documentTypeEnum = pgEnum('ac_document_type', [
  'purchase_invoice',
  'repair_bill',
  'insurance',
  'rc',
  'photo',
  'sale_invoice',
  'other',
]);

export const ledgerEntryTypeEnum = pgEnum('ac_ledger_entry_type', [
  'capital_investment',
  'asset_purchase',
  'expense',
  'payment_received',
  'settlement',
  'reversal',
  'adjustment',
  'manual_profit',
]);

export const ledgerDirectionEnum = pgEnum('ac_ledger_direction', ['debit', 'credit']);

export const manualProfitCategoryEnum = pgEnum('ac_manual_profit_category', [
  'investment_return',
  'adjustment',
  'bonus',
  'settlement',
  'other',
]);

export const fuelTypeEnum = pgEnum('ac_fuel_type', [
  'petrol',
  'diesel',
  'cng',
  'ev',
  'hybrid',
]);

export const ownershipEnum = pgEnum('ac_ownership', [
  'first_owner',
  'second_owner',
  'third_owner',
]);
