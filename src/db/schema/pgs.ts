import { sql } from 'drizzle-orm';
import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { genderPolicyEnum } from './enums';

export type PgAmenities = {
  wifi?: boolean;
  food?: boolean;
  laundry?: boolean;
  parking?: boolean;
  ac?: boolean;
  housekeeping?: boolean;
  powerBackup?: boolean;
  [key: string]: unknown;
};

export const pgs = pgTable('pgs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  geoLat: numeric('geo_lat', { precision: 9, scale: 6 }),
  geoLng: numeric('geo_lng', { precision: 9, scale: 6 }),
  genderPolicy: genderPolicyEnum('gender_policy').notNull(),
  amenities: jsonb('amenities').$type<PgAmenities>().notNull().default({}),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  videos: jsonb('videos').$type<string[]>().notNull().default([]),
  description: text('description'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  hasPaymentEnabled: boolean('has_payment_enabled').notNull().default(false),
  ownerId: uuid('owner_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Pg = typeof pgs.$inferSelect;
export type NewPg = typeof pgs.$inferInsert;
