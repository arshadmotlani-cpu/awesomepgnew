import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid, bigint } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { genderPolicyEnum, monthlyDepositPolicyEnum } from './enums';

export type PgAmenities = {
  wifi?: boolean;
  roomCleaning?: boolean;
  bathroomCleaning?: boolean;
  bedTidy?: boolean;
  bedSheetsWeekly?: boolean;
  laundry?: boolean;
  chairsInRooms?: boolean;
  freeElectricity?: boolean;
  waterCooler?: boolean;
  fridge?: boolean;
  airCoolerChillRoom?: boolean;
  parking?: boolean;
  ac?: boolean;
  /** Legacy umbrella flag — prefer roomCleaning + bathroomCleaning */
  housekeeping?: boolean;
  /** @deprecated Do not advertise — meals are not provided */
  food?: boolean;
  /** @deprecated Do not advertise — no general power backup claim */
  powerBackup?: boolean;
  gym?: boolean;
  farmhouse?: boolean;
  vehicleResale?: boolean;
  cctv?: boolean;
  geyser?: boolean;
  waterPurifier?: boolean;
  lift?: boolean;
  gaming?: boolean;
  arcade?: boolean;
  chillRoom?: boolean;
  socialLounge?: boolean;
  /** Legacy flat deposit per sharing count. */
  depositBySharingPaise?: Record<string, number>;
  /** Rent + deposit presets (paise) per sharing count "1".."5". */
  sharingPresetsPaise?: Record<
    string,
    {
      dailyRatePaise?: number;
      weeklyRatePaise?: number;
      monthlyRatePaise?: number;
      dailyDepositPaise?: number;
      weeklyDepositPaise?: number;
      monthlyDepositPaise?: number;
      /** Legacy keys (without Paise suffix) — migrated on read. */
      dailyRate?: number;
      weeklyRate?: number;
      monthlyRate?: number;
      dailyDeposit?: number;
      weeklyDeposit?: number;
      monthlyDeposit?: number;
    }
  >;
  [key: string]: unknown;
};

export const pgs = pgTable('pgs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  /** Public website label; falls back to `name` when null. */
  publicDisplayName: text('public_display_name'),
  /** Public listing sort order (lower first). */
  displayOrder: integer('display_order'),
  slug: text('slug').notNull().unique(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  geoLat: numeric('geo_lat', { precision: 9, scale: 6 }),
  geoLng: numeric('geo_lng', { precision: 9, scale: 6 }),
  genderPolicy: genderPolicyEnum('gender_policy').notNull(),
  monthlyDepositPolicy: monthlyDepositPolicyEnum('monthly_deposit_policy')
    .notNull()
    .default('one_month'),
  amenities: jsonb('amenities').$type<PgAmenities>().notNull().default({}),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  videos: jsonb('videos').$type<string[]>().notNull().default([]),
  description: text('description'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  hasPaymentEnabled: boolean('has_payment_enabled').notNull().default(false),
  /** Default average room electricity bill (paise) when meter history is unavailable. */
  averageElectricityBillPaise: bigint('average_electricity_bill_paise', { mode: 'number' }),
  ownerId: uuid('owner_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Pg = typeof pgs.$inferSelect;
export type NewPg = typeof pgs.$inferInsert;
