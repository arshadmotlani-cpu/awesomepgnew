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
  uuid,
} from 'drizzle-orm/pg-core';
import { fyhCustomers } from './customers';
import { fyhServices } from './services';

export const FYH_MEMBERSHIP_TIERS = ['silver', 'gold', 'platinum', 'vip'] as const;
export type FyhMembershipTier = (typeof FYH_MEMBERSHIP_TIERS)[number];

export const fyhMembershipPlans = pgTable(
  'fyh_membership_plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
    name: text('name').notNull(),
    serviceId: uuid('service_id').references(() => fyhServices.id, { onDelete: 'set null' }),
    totalSessions: integer('total_sessions').notNull().default(1),
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
    validityDays: integer('validity_days').notNull().default(90),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_package_plans_active_idx').on(t.isActive)],
);

export const fyhCustomerPackages = pgTable(
  'fyh_customer_packages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => fyhPackagePlans.id, { onDelete: 'restrict' }),
    totalSessions: integer('total_sessions').notNull(),
    usedSessions: integer('used_sessions').notNull().default(0),
    expiresOn: date('expires_on'),
    isFrozen: boolean('is_frozen').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_customer_packages_customer_idx').on(t.customerId, t.isActive)],
);

export const fyhBridalProfiles = pgTable(
  'fyh_bridal_profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
export type FyhCustomerPackage = typeof fyhCustomerPackages.$inferSelect;
export type FyhBridalProfile = typeof fyhBridalProfiles.$inferSelect;
export type FyhBridalEvent = typeof fyhBridalEvents.$inferSelect;
