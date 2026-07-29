import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { fyhAppointments } from './appointments';
import { fyhCustomers } from './customers';
import { fyhProducts } from './products';
import { fyhServices } from './services';
import { fyhStaff } from './staff';

export const FYH_INVOICE_STATUSES = [
  'draft',
  'unpaid',
  'partial',
  'paid',
  'void',
  'refunded',
] as const;
export type FyhInvoiceStatus = (typeof FYH_INVOICE_STATUSES)[number];

export const FYH_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank', 'wallet', 'gift_card'] as const;
export type FyhPaymentMethod = (typeof FYH_PAYMENT_METHODS)[number];

export const FYH_INVOICE_LINE_KINDS = [
  'service',
  'product',
  'package',
  'membership',
  'custom',
] as const;
export type FyhInvoiceLineKind = (typeof FYH_INVOICE_LINE_KINDS)[number];
export type FyhInvoiceSource = 'appointment' | 'quick_sale';

/** Stored on draft quick-sale invoices (`status = draft`) until payment. */
export type QuickSalePosDraft = {
  paymentDraft?: {
    cash?: string;
    upi?: string;
    card?: string;
    bank?: string;
    wallet?: string;
  };
  invoiceDiscountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
};

export const FYH_INVOICE_SOURCES = ['appointment', 'quick_sale'] as const;

/**
 * Salon invoices — single money engine for checkout (Phase 2+).
 * All money columns are paise (bigint). Redemption columns default 0 until Phase 5.
 */
export const fyhInvoices = pgTable(
  'fyh_invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceNumber: text('invoice_number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'restrict' }),
    appointmentId: uuid('appointment_id').references(() => fyhAppointments.id, {
      onDelete: 'set null',
    }),
    source: text('source').$type<FyhInvoiceSource>().notNull().default('appointment'),
    stylistId: uuid('stylist_id').references(() => fyhStaff.id, { onDelete: 'set null' }),
    status: text('status').$type<FyhInvoiceStatus>().notNull().default('draft'),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull().default(0),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    grandTotalPaise: bigint('grand_total_paise', { mode: 'number' }).notNull().default(0),
    amountPaidPaise: bigint('amount_paid_paise', { mode: 'number' }).notNull().default(0),
    membershipRedemptionPaise: bigint('membership_redemption_paise', { mode: 'number' })
      .notNull()
      .default(0),
    packageRedemptionPaise: bigint('package_redemption_paise', { mode: 'number' })
      .notNull()
      .default(0),
    walletRedemptionPaise: bigint('wallet_redemption_paise', { mode: 'number' })
      .notNull()
      .default(0),
    giftCardRedemptionPaise: bigint('gift_card_redemption_paise', { mode: 'number' })
      .notNull()
      .default(0),
    tipPaise: bigint('tip_paise', { mode: 'number' }).notNull().default(0),
    roundOffPaise: bigint('round_off_paise', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    /** Quick Sale hold — payment draft and POS-only fields until checkout. */
    posDraft: jsonb('pos_draft').$type<QuickSalePosDraft | null>(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_invoices_number_uidx').on(t.invoiceNumber),
    uniqueIndex('fyh_invoices_appointment_uidx').on(t.appointmentId),
    index('fyh_invoices_customer_idx').on(t.customerId, t.createdAt),
    index('fyh_invoices_status_idx').on(t.status),
    index('fyh_invoices_stylist_idx').on(t.stylistId),
    index('fyh_invoices_created_idx').on(t.createdAt),
  ],
);

export const fyhInvoiceLines = pgTable(
  'fyh_invoice_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => fyhInvoices.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<FyhInvoiceLineKind>().notNull(),
    serviceId: uuid('service_id').references(() => fyhServices.id, { onDelete: 'set null' }),
    productId: uuid('product_id').references(() => fyhProducts.id, { onDelete: 'set null' }),
    /** Package / membership catalog refs — opaque until Phase 5 tables land. */
    packageId: uuid('package_id'),
    membershipId: uuid('membership_id'),
    staffId: uuid('staff_id').references(() => fyhStaff.id, { onDelete: 'set null' }),
    nameSnapshot: text('name_snapshot').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }).notNull().default(1),
    unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull().default(0),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    discountBps: integer('discount_bps').notNull().default(0),
    gstBps: integer('gst_bps').notNull().default(0),
    taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    lineTotalPaise: bigint('line_total_paise', { mode: 'number' }).notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_invoice_lines_invoice_idx').on(t.invoiceId, t.sortOrder),
    index('fyh_invoice_lines_staff_idx').on(t.staffId),
    index('fyh_invoice_lines_service_idx').on(t.serviceId),
    index('fyh_invoice_lines_product_idx').on(t.productId),
  ],
);

export const fyhInvoicePayments = pgTable(
  'fyh_invoice_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => fyhInvoices.id, { onDelete: 'cascade' }),
    method: text('method').$type<FyhPaymentMethod>().notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reference: text('reference'),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_invoice_payments_invoice_idx').on(t.invoiceId, t.paidAt),
    index('fyh_invoice_payments_method_idx').on(t.method),
  ],
);

/**
 * Credit notes / refunds linked to an invoice (Phase 2 foundation).
 */
export const fyhCreditNotes = pgTable(
  'fyh_credit_notes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    creditNoteNumber: text('credit_note_number').notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => fyhInvoices.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason'),
    notes: text('notes'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_credit_notes_number_uidx').on(t.creditNoteNumber),
    index('fyh_credit_notes_invoice_idx').on(t.invoiceId),
    index('fyh_credit_notes_customer_idx').on(t.customerId, t.issuedAt),
  ],
);

export type FyhInvoice = typeof fyhInvoices.$inferSelect;
export type NewFyhInvoice = typeof fyhInvoices.$inferInsert;
export type FyhInvoiceLine = typeof fyhInvoiceLines.$inferSelect;
export type NewFyhInvoiceLine = typeof fyhInvoiceLines.$inferInsert;
export type FyhInvoicePayment = typeof fyhInvoicePayments.$inferSelect;
export type NewFyhInvoicePayment = typeof fyhInvoicePayments.$inferInsert;
export type FyhCreditNote = typeof fyhCreditNotes.$inferSelect;
export type NewFyhCreditNote = typeof fyhCreditNotes.$inferInsert;
