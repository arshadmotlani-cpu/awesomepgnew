import { pgEnum, pgTable, text, timestamp, uuid, jsonb, index, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bookings } from './bookings';
import { customers } from './customers';
import { beds } from './beds';
import { adminUsers } from './adminUsers';
import { vacatingRequests } from './vacatingRequests';
import type { RoomChangeWorkflowState } from '@/src/lib/roomTransfer/stateMachine';

export const roomChangeStatusEnum = pgEnum('room_change_status', [
  'draft',
  'submitted',
  'approved',
  'waiting',
  'rejected',
  'completed',
  'cancelled',
]);

export const roomTransferModeEnum = pgEnum('room_transfer_mode', ['immediate', 'scheduled']);

export const roomChangeRequests = pgTable(
  'room_change_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    fromBedId: uuid('from_bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    toBedId: uuid('to_bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    requestedShiftDate: text('requested_shift_date').notNull(),
    quoteSnapshot: jsonb('quote_snapshot').notNull(),
    transferMode: roomTransferModeEnum('transfer_mode'),
    occupantCheckoutDate: text('occupant_checkout_date'),
    expectedTransferDate: text('expected_transfer_date'),
    sourceVacatingRequestId: uuid('source_vacating_request_id').references(
      () => vacatingRequests.id,
      { onDelete: 'set null' },
    ),
    status: roomChangeStatusEnum('status').notNull().default('submitted'),
    workflowState: text('workflow_state')
      .$type<RoomChangeWorkflowState>()
      .notNull()
      .default('REQUESTED'),
    stateVersion: integer('state_version').notNull().default(1),
    quoteVersion: integer('quote_version').notNull().default(1),
    quoteHash: text('quote_hash'),
    heldAt: timestamp('held_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    adminNotes: text('admin_notes'),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_change_requests_booking_idx').on(t.bookingId),
    index('room_change_requests_status_idx').on(t.status),
    index('room_change_requests_to_bed_status_idx').on(t.toBedId, t.status),
    index('room_change_requests_workflow_expiry_idx').on(t.workflowState, t.expiresAt),
    uniqueIndex('room_change_requests_one_open_per_booking_uidx')
      .on(t.bookingId)
      .where(sql`${t.workflowState} NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')`),
  ],
);

export type RoomChangeRequest = typeof roomChangeRequests.$inferSelect;
export type NewRoomChangeRequest = typeof roomChangeRequests.$inferInsert;
