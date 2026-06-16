import { sql } from 'drizzle-orm';
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';
import { rentInvoices } from './rentInvoices';
import { paymentLinkPurposeEnum, paymentLinkStatusEnum } from './enums';

export const paymentLinks = pgTable(
  'payment_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    residentId: uuid('resident_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    purpose: paymentLinkPurposeEnum('purpose').notNull(),
    upiQrUrl: text('upi_qr_url').notNull(),
    whatsappShareUrl: text('whatsapp_share_url'),
    invoiceId: uuid('invoice_id'),
    title: text('title'),
    description: text('description'),
    paymentProofUrl: text('payment_proof_url'),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    rentInvoiceId: uuid('rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    createdByAdminId: uuid('created_by_admin_id'),
    status: paymentLinkStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_links_resident_idx').on(t.residentId, t.status),
    index('payment_links_pg_idx').on(t.pgId, t.status),
  ],
);

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type NewPaymentLink = typeof paymentLinks.$inferInsert;
