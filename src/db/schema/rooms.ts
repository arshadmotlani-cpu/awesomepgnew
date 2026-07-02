import { sql } from 'drizzle-orm';
import { bigint, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { floors } from './floors';
import { roomTypes } from './roomTypes';
import { roomBillingModeEnum, monthlyDepositPolicyEnum } from './enums';

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    floorId: uuid('floor_id')
      .notNull()
      .references(() => floors.id, { onDelete: 'restrict' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),
    roomNumber: text('room_number').notNull(),
    notes: text('notes'),
    /** Offline electricity paid by a former tenant — applied to the next room bill. */
    electricityPrepaidCreditPaise: bigint('electricity_prepaid_credit_paise', { mode: 'number' })
      .notNull()
      .default(0),
    billingMode: roomBillingModeEnum('billing_mode').notNull().default('per_bed'),
    monthlyDepositPolicy: monthlyDepositPolicyEnum('monthly_deposit_policy'),
    privateRoomMonthlyRentPaise: bigint('private_room_monthly_rent_paise', { mode: 'number' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rooms_floor_id_room_number_unique').on(t.floorId, t.roomNumber),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
