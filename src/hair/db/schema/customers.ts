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

export const FYH_CUSTOMER_GENDERS = [
  'female',
  'male',
  'other',
  'prefer_not_to_say',
] as const;
export type FyhCustomerGender = (typeof FYH_CUSTOMER_GENDERS)[number];

export const FYH_CUSTOMER_SOURCES = [
  'walk_in',
  'referral',
  'instagram',
  'whatsapp',
  'other',
] as const;
export type FyhCustomerSource = (typeof FYH_CUSTOMER_SOURCES)[number];

export const FYH_HAIR_TYPES = [
  'straight',
  'wavy',
  'curly',
  'coily',
  'fine',
  'thick',
  'damaged',
  'other',
] as const;
export type FyhHairType = (typeof FYH_HAIR_TYPES)[number];

export const FYH_SKIN_TYPES = [
  'normal',
  'dry',
  'oily',
  'combination',
  'sensitive',
  'other',
] as const;
export type FyhSkinType = (typeof FYH_SKIN_TYPES)[number];

/**
 * Salon customers — CRM profile foundation for appointments, billing, and loyalty.
 */
export const fyhCustomers = pgTable(
  'fyh_customers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Display code e.g. CL00000174 */
    customerCode: text('customer_code'),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    whatsapp: text('whatsapp'),
    email: text('email'),
    photoUrl: text('photo_url'),
    gender: text('gender').$type<FyhCustomerGender>(),
    dateOfBirth: date('date_of_birth'),
    anniversary: date('anniversary'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    pincode: text('pincode'),
    occupation: text('occupation'),
    hairType: text('hair_type').$type<FyhHairType>(),
    skinType: text('skin_type').$type<FyhSkinType>(),
    allergies: text('allergies'),
    preferredStylist: text('preferred_stylist'),
    referredBy: text('referred_by'),
    tags: text('tags').array().notNull().default(sql`'{}'`),
    /** Internal staff notes (profile field). */
    notes: text('notes'),
    /** Shown prominently during billing. */
    importantAlerts: text('important_alerts'),
    source: text('source').$type<FyhCustomerSource>(),
    firstVisitAt: date('first_visit_at'),
    lastVisitAt: date('last_visit_at'),
    totalVisits: integer('total_visits').notNull().default(0),
    lifetimeSpendPaise: bigint('lifetime_spend_paise', { mode: 'number' }).notNull().default(0),
    averageBillPaise: bigint('average_bill_paise', { mode: 'number' }).notNull().default(0),
    lastService: text('last_service'),
    favouriteService: text('favourite_service'),
    favouriteStylist: text('favourite_stylist'),
    membership: text('membership'),
    walletBalancePaise: bigint('wallet_balance_paise', { mode: 'number' }).notNull().default(0),
    rewardPoints: integer('reward_points').notNull().default(0),
    packagesPurchased: integer('packages_purchased').notNull().default(0),
    giftCardsCount: integer('gift_cards_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_customers_phone_idx').on(t.phone),
    index('fyh_customers_whatsapp_idx').on(t.whatsapp),
    index('fyh_customers_email_idx').on(t.email),
    index('fyh_customers_name_idx').on(t.fullName),
    index('fyh_customers_active_idx').on(t.isActive),
    uniqueIndex('fyh_customers_code_uidx').on(t.customerCode),
  ],
);

export type FyhCustomer = typeof fyhCustomers.$inferSelect;
export type NewFyhCustomer = typeof fyhCustomers.$inferInsert;
