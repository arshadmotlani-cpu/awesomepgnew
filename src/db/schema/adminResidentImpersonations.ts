import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from '@/src/db/schema/adminUsers';
import { authSessions } from '@/src/db/schema/authSessions';
import { beds } from '@/src/db/schema/beds';
import { bookings } from '@/src/db/schema/bookings';
import { customers } from '@/src/db/schema/customers';
import { pgs } from '@/src/db/schema/pgs';
import { rooms } from '@/src/db/schema/rooms';

export const adminImpersonationStatusEnum = pgEnum('admin_impersonation_status', [
  'active',
  'ended',
  'failed',
]);

export const adminResidentImpersonations = pgTable(
  'admin_resident_impersonations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id),
    adminSessionId: uuid('admin_session_id').references(() => authSessions.id, {
      onDelete: 'set null',
    }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    customerSessionId: uuid('customer_session_id').references(() => authSessions.id, {
      onDelete: 'set null',
    }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'set null' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    bedId: uuid('bed_id').references(() => beds.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    status: adminImpersonationStatusEnum('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    exitReason: text('exit_reason'),
    success: boolean('success').notNull().default(true),
    failureReason: text('failure_reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    deviceLabel: text('device_label'),
    browser: text('browser'),
    operatingSystem: text('operating_system'),
    requestId: text('request_id'),
    adminReturnPath: text('admin_return_path').notNull().default('/admin/residents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_resident_impersonations_admin_idx').on(t.adminId, t.startedAt),
    index('admin_resident_impersonations_customer_idx').on(t.customerId, t.startedAt),
  ],
);

export type AdminResidentImpersonation = typeof adminResidentImpersonations.$inferSelect;
