import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { beds } from './beds';

/**
 * Time-versioned per-bed pricing. To resolve the price for a given date pick
 * the row whose `[effective_from, effective_to)` window contains it. An
 * EXCLUDE constraint added in the constraints migration prevents two
 * overlapping pricing rows for the same bed.
 */
export const bedPrices = pgTable(
  'bed_prices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'cascade' }),
    dailyRatePaise: bigint('daily_rate_paise', { mode: 'number' }).notNull().default(0),
    weeklyRatePaise: bigint('weekly_rate_paise', { mode: 'number' }).notNull().default(0),
    monthlyRatePaise: bigint('monthly_rate_paise', { mode: 'number' }).notNull().default(0),
    securityDepositPaise: bigint('security_deposit_paise', { mode: 'number' })
      .notNull()
      .default(0),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bed_prices_bed_id_idx').on(t.bedId),
    check(
      'bed_prices_at_least_one_rate_positive',
      sql`${t.dailyRatePaise} > 0 OR ${t.weeklyRatePaise} > 0 OR ${t.monthlyRatePaise} > 0`,
    ),
    check(
      'bed_prices_effective_window_valid',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

export type BedPrice = typeof bedPrices.$inferSelect;
export type NewBedPrice = typeof bedPrices.$inferInsert;
