import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { financialInvoices } from './financialInvoices';
import { rentInvoices } from './rentInvoices';

/**
 * Append-only collections lifecycle log.
 * Event types are text constants (see billingEvents service) — not a DB enum —
 * so new lifecycle signals can ship without a migration.
 */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    rentInvoiceId: uuid('rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    financialInvoiceId: uuid('financial_invoice_id').references(() => financialInvoices.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('billing_events_booking_id_idx').on(t.bookingId),
    index('billing_events_rent_invoice_id_idx').on(t.rentInvoiceId),
    index('billing_events_event_type_idx').on(t.eventType),
    index('billing_events_created_at_idx').on(t.createdAt),
  ],
);

export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
