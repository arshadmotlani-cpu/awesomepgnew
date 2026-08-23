import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';

export const FYH_SERVICE_CATEGORY_PRESETS = [
  'Hair',
  'Skin',
  'Makeup',
  'Nails',
  'Academy',
  'Digital Production',
] as const;

export const FYH_COMMISSION_TYPES = ['none', 'fixed', 'percentage'] as const;
export type FyhCommissionType = (typeof FYH_COMMISSION_TYPES)[number];

export const fyhServiceCategories = pgTable(
  'fyh_service_categories',
  {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_service_categories_org_name_uidx').on(t.organizationId, t.name),
    uniqueIndex('fyh_service_categories_org_slug_uidx').on(t.organizationId, t.slug),
  ],
);

export const fyhServices = pgTable(
  'fyh_services',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    name: text('name').notNull(),
    code: text('code'),
    category: text('category'),
    durationMinutes: integer('duration_minutes').notNull().default(30),
    /** Selling price (customer-facing). */
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
    /** Internal cost for gross-margin analytics; not shown on POS or invoices. */
    costPricePaise: bigint('cost_price_paise', { mode: 'number' }).notNull().default(0),
    /** GST in basis points (1800 = 18%) */
    gstBps: integer('gst_bps').notNull().default(1800),
    description: text('description'),
    displayOrder: integer('display_order').notNull().default(100),
    commissionType: text('commission_type').$type<FyhCommissionType>().notNull().default('none'),
    commissionFixedPaise: bigint('commission_fixed_paise', { mode: 'number' }).notNull().default(0),
    commissionPercentBps: integer('commission_percent_bps').notNull().default(0),
    overrideStaffCommission: boolean('override_staff_commission').notNull().default(false),
    availableOnline: boolean('available_online').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    showOnWebsite: boolean('show_on_website').notNull().default(false),
    totalBookings: integer('total_bookings').notNull().default(0),
    revenueGeneratedPaise: bigint('revenue_generated_paise', { mode: 'number' }).notNull().default(0),
    lastBookedAt: timestamp('last_booked_at', { withTimezone: true }),
    averageDurationMinutes: integer('average_duration_minutes').notNull().default(0),
    /** Active for new bookings when true; archived rows stay for historical invoices. */
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_services_name_idx').on(t.name),
    index('fyh_services_active_idx').on(t.isActive),
    index('fyh_services_category_idx').on(t.category),
    index('fyh_services_display_order_idx').on(t.displayOrder, t.name),
  ],
);

export type FyhService = typeof fyhServices.$inferSelect;
export type FyhServiceCategory = typeof fyhServiceCategories.$inferSelect;
