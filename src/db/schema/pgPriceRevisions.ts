import { sql } from 'drizzle-orm';
import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { pgs } from './pgs';

export type PgPriceRevisionBedChange = {
  bedId: string;
  roomNumber: string;
  bedCode: string;
  oldRentPaise: number;
  newRentPaise: number;
  oldDepositPaise: number;
  newDepositPaise: number;
};

export const pgPriceRevisions = pgTable('pg_price_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  pgId: uuid('pg_id')
    .notNull()
    .references(() => pgs.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'restrict' }),
  rentPercentChange: numeric('rent_percent_change', { precision: 8, scale: 4 }),
  depositPercentChange: numeric('deposit_percent_change', { precision: 8, scale: 4 }),
  bedsAffected: integer('beds_affected').notNull(),
  oldAvgRentPaise: bigint('old_avg_rent_paise', { mode: 'number' }).notNull(),
  newAvgRentPaise: bigint('new_avg_rent_paise', { mode: 'number' }).notNull(),
  oldAvgDepositPaise: bigint('old_avg_deposit_paise', { mode: 'number' }).notNull(),
  newAvgDepositPaise: bigint('new_avg_deposit_paise', { mode: 'number' }).notNull(),
  oldTotalMonthlyRentPaise: bigint('old_total_monthly_rent_paise', { mode: 'number' }).notNull(),
  newTotalMonthlyRentPaise: bigint('new_total_monthly_rent_paise', { mode: 'number' }).notNull(),
  reason: text('reason'),
  bedChanges: jsonb('bed_changes').$type<PgPriceRevisionBedChange[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PgPriceRevision = typeof pgPriceRevisions.$inferSelect;
