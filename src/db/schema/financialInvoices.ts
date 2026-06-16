import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { bookings } from './bookings';
import { customers } from './customers';
import { financialInvoiceStatusEnum, financialInvoiceTypeEnum } from './enums';
import { paymentLinks } from './paymentLinks';
import { payments } from './payments';
import { pgs } from './pgs';

export type InvoiceBreakdown = {
  rentPaise?: number;
  electricityPaise?: number;
  depositPaise?: number;
  ps4Paise?: number;
  otherPaise?: number;
  lateFeePaise?: number;
  paidPaise?: number;
  lines?: Array<{
    kind: string;
    label: string;
    amountPaise: number;
    sourceTable?: string | null;
    sourceId?: string | null;
  }>;
};

export const financialInvoices = pgTable(
  'financial_invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceNumber: text('invoice_number').notNull(),
    invoiceType: financialInvoiceTypeEnum('invoice_type').notNull(),
    sourceTable: text('source_table'),
    sourceId: uuid('source_id'),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    bedId: uuid('bed_id').references(() => beds.id, { onDelete: 'set null' }),
    roomNumber: text('room_number'),
    bedCode: text('bed_code'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    breakdown: jsonb('breakdown').$type<InvoiceBreakdown>(),
    status: financialInvoiceStatusEnum('status').notNull().default('sent'),
    dueDate: date('due_date'),
    billingMonth: date('billing_month'),
    paymentLinkId: uuid('payment_link_id').references(() => paymentLinks.id, {
      onDelete: 'set null',
    }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    refundReason: text('refund_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('financial_invoices_number_unique').on(t.invoiceNumber),
    uniqueIndex('financial_invoices_source_unique')
      .on(t.sourceTable, t.sourceId)
      .where(sql`${t.sourceTable} IS NOT NULL AND ${t.sourceId} IS NOT NULL`),
    index('financial_invoices_status_idx').on(t.status, t.createdAt),
    index('financial_invoices_pg_idx').on(t.pgId, t.billingMonth),
    index('financial_invoices_customer_idx').on(t.customerId),
  ],
);

export const invoiceAuditEvents = pgTable(
  'invoice_audit_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => financialInvoices.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    actorType: text('actor_type').notNull().default('system'),
    actorId: uuid('actor_id'),
    diff: jsonb('diff'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invoice_audit_events_invoice_idx').on(t.invoiceId, t.createdAt)],
);

export type FinancialInvoice = typeof financialInvoices.$inferSelect;
export type NewFinancialInvoice = typeof financialInvoices.$inferInsert;
