import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol } from './tenantColumns';
import { fyhCustomers } from './customers';
import { fyhServices } from './services';

export const FYH_MEMBERSHIP_TIERS = ['silver', 'gold', 'platinum', 'vip'] as const;
export type FyhMembershipTier = (typeof FYH_MEMBERSHIP_TIERS)[number];

export const fyhMembershipPlans = pgTable(
  'fyh_membership_plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    name: text('name').notNull(),
    tier: text('tier').$type<FyhMembershipTier>().notNull(),
    discountBps: integer('discount_bps').notNull().default(0),
    priorityBooking: boolean('priority_booking').notNull().default(false),
    birthdayBenefit: text('birthday_benefit'),
    anniversaryOffer: text('anniversary_offer'),
    rewardMultiplierBps: integer('reward_multiplier_bps').notNull().default(10000),
    validityDays: integer('validity_days').notNull().default(365),
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_membership_plans_active_idx').on(t.isActive)],
);

export const fyhCustomerMemberships = pgTable(
  'fyh_customer_memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => fyhMembershipPlans.id, { onDelete: 'restrict' }),
    startsOn: date('starts_on').notNull(),
    expiresOn: date('expires_on').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_customer_memberships_customer_idx').on(t.customerId, t.isActive)],
);

export const fyhPackagePlans = pgTable(
  'fyh_package_plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    name: text('name').notNull(),
    serviceId: uuid('service_id').references(() => fyhServices.id, { onDelete: 'set null' }),
    totalSessions: integer('total_sessions').notNull().default(1),
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
    normalValuePaise: bigint('normal_value_paise', { mode: 'number' }).notNull().default(0),
    /** NULL = forever validity */
    validityDays: integer('validity_days').$type<number | null>().default(90),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_package_plans_active_idx').on(t.isActive)],
);

export const fyhPackagePlanItems = pgTable(
  'fyh_package_plan_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => fyhPackagePlans.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => fyhServices.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_package_plan_items_plan_service_uidx').on(t.planId, t.serviceId),
    index('fyh_package_plan_items_plan_idx').on(t.planId),
    index('fyh_package_plan_items_service_idx').on(t.serviceId),
  ],
);

export const fyhCustomerPackages = pgTable(
  'fyh_customer_packages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => fyhPackagePlans.id, { onDelete: 'restrict' }),
    nameSnapshot: text('name_snapshot'),
    offerPricePaise: bigint('offer_price_paise', { mode: 'number' }).notNull().default(0),
    normalValuePaise: bigint('normal_value_paise', { mode: 'number' }).notNull().default(0),
    purchaseInvoiceId: uuid('purchase_invoice_id'),
    purchaseInvoiceLineId: uuid('purchase_invoice_line_id'),
    totalSessions: integer('total_sessions').notNull(),
    usedSessions: integer('used_sessions').notNull().default(0),
    expiresOn: date('expires_on'),
    isFrozen: boolean('is_frozen').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_customer_packages_customer_idx').on(t.customerId, t.isActive)],
);

export const fyhCustomerPackageCredits = pgTable(
  'fyh_customer_package_credits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerPackageId: uuid('customer_package_id')
      .notNull()
      .references(() => fyhCustomerPackages.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => fyhServices.id, { onDelete: 'restrict' }),
    serviceNameSnapshot: text('service_name_snapshot').notNull(),
    totalCredits: integer('total_credits').notNull(),
    usedCredits: integer('used_credits').notNull().default(0),
    effectiveUnitValuePaise: bigint('effective_unit_value_paise', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_customer_package_credits_pkg_service_uidx').on(t.customerPackageId, t.serviceId),
    index('fyh_customer_package_credits_pkg_idx').on(t.customerPackageId),
    index('fyh_customer_package_credits_service_idx').on(t.serviceId),
  ],
);

export const FYH_PACKAGE_CREDIT_LEDGER_EVENTS = ['purchase', 'redeem', 'void', 'expire'] as const;
export type FyhPackageCreditLedgerEvent = (typeof FYH_PACKAGE_CREDIT_LEDGER_EVENTS)[number];

export const fyhPackageCreditLedger = pgTable(
  'fyh_package_credit_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerPackageId: uuid('customer_package_id')
      .notNull()
      .references(() => fyhCustomerPackages.id, { onDelete: 'cascade' }),
    creditId: uuid('credit_id')
      .notNull()
      .references(() => fyhCustomerPackageCredits.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<FyhPackageCreditLedgerEvent>().notNull(),
    serviceId: uuid('service_id'),
    quantity: integer('quantity').notNull(),
    effectiveValuePaise: bigint('effective_value_paise', { mode: 'number' }).notNull().default(0),
    invoiceId: uuid('invoice_id'),
    invoiceLineId: uuid('invoice_line_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_package_credit_ledger_idempotency_uidx').on(t.idempotencyKey),
    index('fyh_package_credit_ledger_pkg_idx').on(t.customerPackageId),
    index('fyh_package_credit_ledger_invoice_idx').on(t.invoiceId),
  ],
);

export const fyhBridalProfiles = pgTable(
  'fyh_bridal_profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    brideName: text('bride_name').notNull(),
    weddingDate: date('wedding_date'),
    notes: text('notes'),
    outstandingPaise: bigint('outstanding_paise', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_bridal_profiles_customer_idx').on(t.customerId)],
);

export const FYH_BRIDAL_EVENTS = [
  'trial',
  'engagement',
  'haldi',
  'mehendi',
  'sangeet',
  'wedding',
  'reception',
] as const;
export type FyhBridalEventType = (typeof FYH_BRIDAL_EVENTS)[number];

export const fyhBridalEvents = pgTable(
  'fyh_bridal_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    bridalProfileId: uuid('bridal_profile_id')
      .notNull()
      .references(() => fyhBridalProfiles.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<FyhBridalEventType>().notNull(),
    eventDate: date('event_date'),
    notes: text('notes'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_bridal_events_profile_idx').on(t.bridalProfileId)],
);

export type FyhMembershipPlan = typeof fyhMembershipPlans.$inferSelect;
export type FyhCustomerMembership = typeof fyhCustomerMemberships.$inferSelect;
export type FyhPackagePlan = typeof fyhPackagePlans.$inferSelect;
export type FyhPackagePlanItem = typeof fyhPackagePlanItems.$inferSelect;
export type FyhCustomerPackage = typeof fyhCustomerPackages.$inferSelect;
export type FyhCustomerPackageCredit = typeof fyhCustomerPackageCredits.$inferSelect;
export type FyhPackageCreditLedger = typeof fyhPackageCreditLedger.$inferSelect;
export type FyhBridalProfile = typeof fyhBridalProfiles.$inferSelect;
export type FyhBridalEvent = typeof fyhBridalEvents.$inferSelect;
