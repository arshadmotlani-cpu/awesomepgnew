import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhInvoiceLines } from './billing';
import { fyhStaff } from './staff';

export const FYH_COMMISSION_ENTRY_STATUSES = ['pending', 'paid'] as const;
export type FyhCommissionEntryStatus = (typeof FYH_COMMISSION_ENTRY_STATUSES)[number];

/**
 * Commission ledger rows derived from paid invoice lines (Phase 4 engine).
 * Created now so billing can enqueue pending rows on payment.
 */
export const fyhCommissionEntries = pgTable(
  'fyh_commission_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => fyhInvoiceLines.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => fyhStaff.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').$type<FyhCommissionEntryStatus>().notNull().default('pending'),
    /** Commission period bucket (usually invoice paid date, salon-local). */
    periodDate: date('period_date').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_commission_entries_staff_period_idx').on(t.staffId, t.periodDate),
    index('fyh_commission_entries_status_idx').on(t.status),
    index('fyh_commission_entries_line_idx').on(t.invoiceLineId),
  ],
);

export type FyhCommissionEntry = typeof fyhCommissionEntries.$inferSelect;
export type NewFyhCommissionEntry = typeof fyhCommissionEntries.$inferInsert;
