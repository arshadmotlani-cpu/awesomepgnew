import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { pgs } from './pgs';
import { rooms } from './rooms';

export const roomConfigurationScheduleStatus = pgEnum('room_configuration_schedule_status', [
  'scheduled',
  'applied',
  'cancelled',
]);

export type RoomConfigurationPreviousSnapshot = {
  bedCount: number;
  roomTypeName: string;
  monthlyRatePaise: number;
  monthlyDepositPaise: number;
};

export const roomConfigurationSchedules = pgTable(
  'room_configuration_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    status: roomConfigurationScheduleStatus('status').notNull().default('scheduled'),
    effectiveFrom: date('effective_from').notNull(),
    targetBedCount: integer('target_bed_count').notNull(),
    roomTypeName: text('room_type_name').notNull(),
    hasAc: boolean('has_ac').notNull().default(false),
    dailyRatePaise: bigint('daily_rate_paise', { mode: 'number' }).notNull().default(0),
    weeklyRatePaise: bigint('weekly_rate_paise', { mode: 'number' }).notNull().default(0),
    monthlyRatePaise: bigint('monthly_rate_paise', { mode: 'number' }).notNull().default(0),
    dailyDepositPaise: bigint('daily_deposit_paise', { mode: 'number' }).notNull().default(0),
    weeklyDepositPaise: bigint('weekly_deposit_paise', { mode: 'number' }).notNull().default(0),
    monthlyDepositPaise: bigint('monthly_deposit_paise', { mode: 'number' }).notNull().default(0),
    previousSnapshot: jsonb('previous_snapshot')
      .$type<RoomConfigurationPreviousSnapshot>()
      .notNull()
      .default({ bedCount: 1, roomTypeName: '', monthlyRatePaise: 0, monthlyDepositPaise: 0 }),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_configuration_schedules_room_effective_idx').on(t.roomId, t.effectiveFrom),
    index('room_configuration_schedules_pg_status_idx').on(t.pgId, t.status, t.effectiveFrom),
  ],
);

export type RoomConfigurationSchedule = typeof roomConfigurationSchedules.$inferSelect;
export type NewRoomConfigurationSchedule = typeof roomConfigurationSchedules.$inferInsert;
