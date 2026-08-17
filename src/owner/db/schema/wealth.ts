import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ooAdminUsers } from './admin';
import {
  ooAssetClassEnum,
  ooAssetTypeEnum,
  ooEconomicEventTypeEnum,
  ooExpenseCategoryEnum,
  ooIntegrationFactKindEnum,
  ooLiabilityTypeEnum,
  ooPaymentAllocationModeEnum,
  ooPropertyIncomeSourceStatusEnum,
  ooPropertyIncomeSourceTypeEnum,
  ooRecurringFrequencyEnum,
  ooScheduleStatusEnum,
  ooSourceSystemEnum,
  ooValuationKindEnum,
} from './enums';

export const ooFinancialAccounts = pgTable(
  'oo_financial_accounts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    accountType: text('account_type').notNull().default('bank'),
    currency: text('currency').notNull().default('INR'),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oo_financial_accounts_active_idx').on(t.isActive)],
);

export const ooBusinesses = pgTable('oo_businesses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  sourceSystem: ooSourceSystemEnum('source_system').notNull().default('OWNER_OS'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ooAssets = pgTable(
  'oo_assets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    assetType: ooAssetTypeEnum('asset_type').notNull(),
    assetClass: ooAssetClassEnum('asset_class').notNull().default('FIXED'),
    ownershipPctBps: integer('ownership_pct_bps').notNull().default(10000),
    businessId: uuid('business_id').references(() => ooBusinesses.id, { onDelete: 'set null' }),
    linkedPgId: uuid('linked_pg_id'),
    linkedCapitalAssetId: uuid('linked_capital_asset_id'),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_assets_type_idx').on(t.assetType),
    index('oo_assets_pg_idx').on(t.linkedPgId),
  ],
);

export const ooProperties = pgTable(
  'oo_properties',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    propertyType: text('property_type').notNull().default('residential'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    postalCode: text('postal_code'),
    purchaseDate: date('purchase_date'),
    purchasePricePaise: bigint('purchase_price_paise', { mode: 'number' }).notNull().default(0),
    purchaseCostsPaise: bigint('purchase_costs_paise', { mode: 'number' }).notNull().default(0),
    purchaseCostsBreakdownJson: jsonb('purchase_costs_breakdown_json')
      .$type<Record<string, number>>()
      .default({}),
    appreciationMethod: text('appreciation_method').notNull().default('FLAT_ANNUAL'),
    monthlyRentalIncomePaise: bigint('monthly_rental_income_paise', { mode: 'number' })
      .notNull()
      .default(0),
    otherMonthlyIncomePaise: bigint('other_monthly_income_paise', { mode: 'number' })
      .notNull()
      .default(0),
    linkedPgId: uuid('linked_pg_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oo_properties_asset_idx').on(t.assetId)],
);

export const ooPropertyIncomeSources = pgTable(
  'oo_property_income_sources',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    sourceType: ooPropertyIncomeSourceTypeEnum('source_type').notNull(),
    name: text('name').notNull(),
    tenantName: text('tenant_name'),
    monthlyAmountPaise: bigint('monthly_amount_paise', { mode: 'number' }).notNull().default(0),
    securityDepositPaise: bigint('security_deposit_paise', { mode: 'number' }).notNull().default(0),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: ooPropertyIncomeSourceStatusEnum('status').notNull().default('ACTIVE'),
    sourceSystem: ooSourceSystemEnum('source_system'),
    sourceReferenceId: text('source_reference_id'),
    linkedPgId: uuid('linked_pg_id'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_property_income_sources_asset_idx').on(t.assetId),
    index('oo_property_income_sources_status_idx').on(t.status),
    index('oo_property_income_sources_pg_idx').on(t.linkedPgId),
  ],
);

export const ooPropertyIncomeRentHistory = pgTable(
  'oo_property_income_rent_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    incomeSourceId: uuid('income_source_id')
      .notNull()
      .references(() => ooPropertyIncomeSources.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    monthlyAmountPaise: bigint('monthly_amount_paise', { mode: 'number' }).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_property_income_rent_history_source_idx').on(
      t.incomeSourceId,
      t.effectiveFrom,
    ),
  ],
);

export const ooMovableAssets = pgTable(
  'oo_movable_assets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    movableType: text('movable_type').notNull().default('vehicle'),
    make: text('make'),
    model: text('model'),
    purchaseDate: date('purchase_date'),
    purchasePricePaise: bigint('purchase_price_paise', { mode: 'number' }).notNull().default(0),
    rateMethod: text('rate_method').notNull().default('FLAT_ANNUAL'),
    annualRateBps: integer('annual_rate_bps').notNull().default(0),
    isDepreciation: integer('is_depreciation').notNull().default(1),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oo_movable_assets_asset_idx').on(t.assetId)],
);

export const ooMovableValuations = pgTable(
  'oo_movable_valuations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    valuationDate: date('valuation_date').notNull(),
    valuePaise: bigint('value_paise', { mode: 'number' }).notNull(),
    kind: ooValuationKindEnum('kind').notNull().default('MARKET_ESTIMATE'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oo_movable_valuations_asset_idx').on(t.assetId, t.valuationDate)],
);

export const ooPropertyValuations = pgTable(
  'oo_property_valuations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    valuationDate: date('valuation_date').notNull(),
    valuePaise: bigint('value_paise', { mode: 'number' }).notNull(),
    kind: ooValuationKindEnum('kind').notNull().default('MARKET_ESTIMATE'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_property_valuations_asset_date_idx').on(t.assetId, t.valuationDate),
    index('oo_property_valuations_kind_idx').on(t.kind),
  ],
);

export const ooPropertyAppreciationAssumptions = pgTable(
  'oo_property_appreciation_assumptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => ooAssets.id, { onDelete: 'cascade' }),
    annualRateBps: integer('annual_rate_bps').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oo_property_appreciation_asset_idx').on(t.assetId, t.effectiveFrom)],
);

export const ooLiabilities = pgTable(
  'oo_liabilities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    lender: text('lender'),
    liabilityType: ooLiabilityTypeEnum('liability_type').notNull(),
    originalPrincipalPaise: bigint('original_principal_paise', { mode: 'number' }).notNull(),
    currentPrincipalPaise: bigint('current_principal_paise', { mode: 'number' }).notNull(),
    interestRateBps: integer('interest_rate_bps').notNull().default(0),
    startDate: date('start_date'),
    firstPaymentDate: date('first_payment_date'),
    endDate: date('end_date'),
    tenureMonths: integer('tenure_months'),
    repaymentFrequency: text('repayment_frequency').default('monthly'),
    fixedPaymentPaise: bigint('fixed_payment_paise', { mode: 'number' }),
    accruedInterestPaise: bigint('accrued_interest_paise', { mode: 'number' }).notNull().default(0),
    lastAccrualDate: date('last_accrual_date'),
    assetId: uuid('asset_id').references(() => ooAssets.id, { onDelete: 'set null' }),
    businessId: uuid('business_id').references(() => ooBusinesses.id, { onDelete: 'set null' }),
    rulesJson: jsonb('rules_json').$type<Record<string, unknown>>().default({}),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_liabilities_type_idx').on(t.liabilityType),
    index('oo_liabilities_asset_idx').on(t.assetId),
    index('oo_liabilities_active_idx').on(t.isActive),
  ],
);

export const ooLiabilitySchedules = pgTable(
  'oo_liability_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    liabilityId: uuid('liability_id')
      .notNull()
      .references(() => ooLiabilities.id, { onDelete: 'cascade' }),
    dueDate: date('due_date').notNull(),
    principalDuePaise: bigint('principal_due_paise', { mode: 'number' }).notNull().default(0),
    interestDuePaise: bigint('interest_due_paise', { mode: 'number' }).notNull().default(0),
    principalPaidPaise: bigint('principal_paid_paise', { mode: 'number' }).notNull().default(0),
    interestPaidPaise: bigint('interest_paid_paise', { mode: 'number' }).notNull().default(0),
    status: ooScheduleStatusEnum('status').notNull().default('UPCOMING'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_liability_schedules_due_idx').on(t.dueDate),
    index('oo_liability_schedules_liability_idx').on(t.liabilityId, t.dueDate),
    index('oo_liability_schedules_status_idx').on(t.status),
  ],
);

export const ooLiabilityAccruals = pgTable(
  'oo_liability_accruals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    liabilityId: uuid('liability_id')
      .notNull()
      .references(() => ooLiabilities.id, { onDelete: 'cascade' }),
    accrualDate: date('accrual_date').notNull(),
    interestAccruedPaise: bigint('interest_accrued_paise', { mode: 'number' }).notNull(),
    principalBalancePaise: bigint('principal_balance_paise', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('oo_liability_accruals_unique').on(t.liabilityId, t.accrualDate),
    index('oo_liability_accruals_date_idx').on(t.accrualDate),
  ],
);

export const ooJournalEntries = pgTable(
  'oo_journal_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entryDate: date('entry_date').notNull(),
    description: text('description').notNull(),
    sourceSystem: ooSourceSystemEnum('source_system').notNull().default('OWNER_OS'),
    externalRef: text('external_ref'),
    eventType: ooEconomicEventTypeEnum('event_type').notNull(),
    reversalOfId: uuid('reversal_of_id'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('oo_journal_entries_external_ref_idx').on(t.sourceSystem, t.externalRef),
    index('oo_journal_entries_date_idx').on(t.entryDate),
    index('oo_journal_entries_type_idx').on(t.eventType),
    index('oo_journal_entries_source_idx').on(t.sourceSystem),
  ],
);

export const ooJournalLines = pgTable(
  'oo_journal_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => ooJournalEntries.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    eventType: ooEconomicEventTypeEnum('event_type').notNull(),
    category: ooExpenseCategoryEnum('category'),
    subcategory: text('subcategory'),
    accountId: uuid('account_id').references(() => ooFinancialAccounts.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => ooAssets.id, { onDelete: 'set null' }),
    liabilityId: uuid('liability_id').references(() => ooLiabilities.id, { onDelete: 'set null' }),
    businessId: uuid('business_id').references(() => ooBusinesses.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_journal_lines_entry_idx').on(t.entryId),
    index('oo_journal_lines_account_idx').on(t.accountId),
    index('oo_journal_lines_asset_idx').on(t.assetId),
    index('oo_journal_lines_liability_idx').on(t.liabilityId),
    index('oo_journal_lines_type_idx').on(t.eventType),
  ],
);

export const ooJournalLineAllocations = pgTable(
  'oo_journal_line_allocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    journalLineId: uuid('journal_line_id')
      .notNull()
      .references(() => ooJournalLines.id, { onDelete: 'cascade' }),
    interestPaise: bigint('interest_paise', { mode: 'number' }).notNull().default(0),
    principalPaise: bigint('principal_paise', { mode: 'number' }).notNull().default(0),
    allocationMode: ooPaymentAllocationModeEnum('allocation_mode').notNull().default('AUTO'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oo_journal_line_allocations_line_idx').on(t.journalLineId)],
);

export const ooIntegrationFacts = pgTable(
  'oo_integration_facts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sourceSystem: ooSourceSystemEnum('source_system').notNull(),
    externalRef: text('external_ref').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    kind: ooIntegrationFactKindEnum('kind').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    assetId: uuid('asset_id').references(() => ooAssets.id, { onDelete: 'set null' }),
    liabilityId: uuid('liability_id').references(() => ooLiabilities.id, { onDelete: 'set null' }),
    businessId: uuid('business_id').references(() => ooBusinesses.id, { onDelete: 'set null' }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('oo_integration_facts_ref_idx').on(t.sourceSystem, t.externalRef),
    index('oo_integration_facts_period_idx').on(t.periodStart, t.periodEnd),
    index('oo_integration_facts_kind_idx').on(t.kind),
  ],
);

export const ooRecurringObligations = pgTable(
  'oo_recurring_obligations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    frequency: ooRecurringFrequencyEnum('frequency').notNull().default('MONTHLY'),
    category: ooExpenseCategoryEnum('category').notNull().default('OTHER'),
    nextDueDate: date('next_due_date'),
    accountId: uuid('account_id').references(() => ooFinancialAccounts.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => ooAssets.id, { onDelete: 'set null' }),
    liabilityId: uuid('liability_id').references(() => ooLiabilities.id, { onDelete: 'set null' }),
    businessId: uuid('business_id').references(() => ooBusinesses.id, { onDelete: 'set null' }),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_recurring_obligations_due_idx').on(t.nextDueDate),
    index('oo_recurring_obligations_active_idx').on(t.isActive),
  ],
);

export const ooAttachments = pgTable(
  'oo_attachments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    createdBy: uuid('created_by').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oo_attachments_entity_idx').on(t.entityType, t.entityId)],
);

export const ooAuditLog = pgTable(
  'oo_audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    beforeJson: jsonb('before_json').$type<Record<string, unknown>>(),
    afterJson: jsonb('after_json').$type<Record<string, unknown>>(),
    actorId: uuid('actor_id').references(() => ooAdminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_audit_log_entity_idx').on(t.entityType, t.entityId),
    index('oo_audit_log_created_idx').on(t.createdAt),
  ],
);
