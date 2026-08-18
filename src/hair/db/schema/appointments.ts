import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhAdminUsers } from './admin';
import { fyhCustomers } from './customers';
import { fyhServices } from './services';
import { fyhStaff } from './staff';

export const FYH_APPOINTMENT_STATUSES = [
  'booked',
  'confirmed',
  'arrived',
  'in_service',
  'completed',
  'cancelled',
  'no_show',
  'paid',
] as const;
export type FyhAppointmentStatus = (typeof FYH_APPOINTMENT_STATUSES)[number];

export const FYH_RESOURCE_TYPES = [
  'chair',
  'vip_chair',
  'wash_station',
  'makeup_room',
  'bridal_room',
  'facial_room',
  'nail_station',
] as const;
export type FyhResourceType = (typeof FYH_RESOURCE_TYPES)[number];

export const FYH_APPOINTMENT_SOURCES = ['booking', 'walk_in'] as const;
export type FyhAppointmentSource = (typeof FYH_APPOINTMENT_SOURCES)[number];

/**
 * Salon chairs / rooms used for calendar resource lanes and conflict checks.
 */
export const fyhResources = pgTable(
  'fyh_resources',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    name: text('name').notNull(),
    type: text('type').$type<FyhResourceType>().notNull(),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_resources_active_idx').on(t.isActive),
    index('fyh_resources_type_idx').on(t.type),
    index('fyh_resources_sort_order_idx').on(t.sortOrder, t.name),
  ],
);

/**
 * Weekly working hours per stylist — dayOfWeek 0=Sunday … 6=Saturday.
 * Times stored as HH:MM (24h) text for stable salon-local scheduling.
 */
export const fyhStaffSchedules = pgTable(
  'fyh_staff_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => fyhStaff.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull().default('10:00'),
    endTime: text('end_time').notNull().default('19:00'),
    lunchStart: text('lunch_start'),
    lunchEnd: text('lunch_end'),
    isOff: boolean('is_off').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_staff_schedules_staff_idx').on(t.staffId, t.dayOfWeek)],
);

/**
 * Salon appointments — visit lifecycle foundation for calendar + checkout.
 * invoiceId is text until migration 0008 promotes it to a uuid FK on fyh_invoices.
 */
export const fyhAppointments = pgTable(
  'fyh_appointments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => fyhStaff.id, { onDelete: 'restrict' }),
    resourceId: uuid('resource_id').references(() => fyhResources.id, {
      onDelete: 'set null',
    }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: text('status').$type<FyhAppointmentStatus>().notNull().default('booked'),
    notes: text('notes'),
    source: text('source').$type<FyhAppointmentSource>().notNull().default('booking'),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    /**
     * Linked invoice (nullable until checkout). Migration 0007 creates as text;
     * 0008 promotes to uuid FK on fyh_invoices. Drizzle models the final uuid column;
     * FK is enforced in SQL to avoid a circular schema import with billing.ts.
     */
    invoiceId: uuid('invoice_id'),
    recurrenceParentId: uuid('recurrence_parent_id'),
    createdByAdminId: uuid('created_by_admin_id').references(() => fyhAdminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_appointments_staff_time_idx').on(t.staffId, t.startAt, t.endAt),
    index('fyh_appointments_resource_time_idx').on(t.resourceId, t.startAt, t.endAt),
    index('fyh_appointments_start_at_idx').on(t.startAt),
    index('fyh_appointments_customer_idx').on(t.customerId, t.startAt),
    index('fyh_appointments_status_idx').on(t.status),
    index('fyh_appointments_invoice_idx').on(t.invoiceId),
    index('fyh_appointments_recurrence_idx').on(t.recurrenceParentId),
  ],
);
/**
 * Service line snapshots on an appointment (price/duration frozen at booking time).
 */
export const fyhAppointmentServices = pgTable(
  'fyh_appointment_services',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => fyhAppointments.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => fyhServices.id, { onDelete: 'restrict' }),
    nameSnapshot: text('name_snapshot').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
    gstBps: integer('gst_bps').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_appointment_services_appointment_idx').on(t.appointmentId, t.sortOrder),
    index('fyh_appointment_services_service_idx').on(t.serviceId),
  ],
);

export type FyhResource = typeof fyhResources.$inferSelect;
export type NewFyhResource = typeof fyhResources.$inferInsert;
export type FyhStaffSchedule = typeof fyhStaffSchedules.$inferSelect;
export type NewFyhStaffSchedule = typeof fyhStaffSchedules.$inferInsert;
export type FyhAppointment = typeof fyhAppointments.$inferSelect;
export type NewFyhAppointment = typeof fyhAppointments.$inferInsert;
export type FyhAppointmentService = typeof fyhAppointmentServices.$inferSelect;
export type NewFyhAppointmentService = typeof fyhAppointmentServices.$inferInsert;
