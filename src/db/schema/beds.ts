import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid, boolean, date } from 'drizzle-orm/pg-core';
import { bedStatusEnum } from './enums';
import { rooms } from './rooms';

export const beds = pgTable(
  'beds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    bedCode: text('bed_code').notNull(),
    status: bedStatusEnum('status').notNull().default('available'),
    /** When true, bed shows as occupied on admin + customer maps until cleared. */
    manualOccupied: boolean('manual_occupied').notNull().default(false),
    /** Admin-marked reserve window — bed shows Reserved until check-in date. */
    manualReservedStart: date('manual_reserved_start'),
    manualReservedCheckIn: date('manual_reserved_check_in'),
    notes: text('notes'),
    maintenanceReason: text('maintenance_reason'),
    maintenanceReasonCustom: text('maintenance_reason_custom'),
    maintenanceStartedAt: date('maintenance_started_at'),
    maintenanceExpectedCompletion: date('maintenance_expected_completion'),
    maintenanceNotes: text('maintenance_notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('beds_room_id_bed_code_unique').on(t.roomId, t.bedCode),
  ],
);

export type Bed = typeof beds.$inferSelect;
export type NewBed = typeof beds.$inferInsert;
