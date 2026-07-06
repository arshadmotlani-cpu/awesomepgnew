import { sql } from 'drizzle-orm';
import { date, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { roomChangeRequests } from './roomChangeRequests';

export const roomTransferHoldStatusEnum = pgEnum('room_transfer_hold_status', [
  'active',
  'released',
]);

export const roomTransferBedHolds = pgTable(
  'room_transfer_bed_holds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    roomChangeRequestId: uuid('room_change_request_id')
      .notNull()
      .references(() => roomChangeRequests.id, { onDelete: 'cascade' }),
    status: roomTransferHoldStatusEnum('status').notNull().default('active'),
    holdFromDate: date('hold_from_date').notNull(),
    transferDate: date('transfer_date').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_transfer_bed_holds_active_bed_uidx')
      .on(t.bedId)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex('room_transfer_bed_holds_request_uidx').on(t.roomChangeRequestId),
    index('room_transfer_bed_holds_bed_status_idx').on(t.bedId, t.status),
  ],
);

export type RoomTransferBedHold = typeof roomTransferBedHolds.$inferSelect;
export type NewRoomTransferBedHold = typeof roomTransferBedHolds.$inferInsert;
