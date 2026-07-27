/**
 * Collections Phase 3 — late fee policies, reminder engine tables, payment receipts.
 */
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { financialInvoices } from './financialInvoices';
import { payments } from './payments';
import { pgPaymentRecords } from './pgPaymentRecords';
import { pgs } from './pgs';
import { rentInvoices } from './rentInvoices';

export const lateFeePolicyTypeEnum = pgEnum('late_fee_policy_type', [
  'fixed_per_day',
  'percent_of_principal',
]);

export const lateFeeAppliesToEnum = pgEnum('late_fee_applies_to', [
  'rent',
  'electricity',
  'both',
]);

export const collectionReminderChannelEnum = pgEnum('collection_reminder_channel', [
  'whatsapp',
  'sms',
  'email',
  'in_app',
]);

export const collectionReminderAnchorEnum = pgEnum('collection_reminder_anchor', [
  'billing_date',
  'due_date',
]);

export const collectionReminderDeliveryStatusEnum = pgEnum(
  'collection_reminder_delivery_status',
  ['pending', 'sent_link', 'failed', 'skipped'],
);

export const lateFeePolicies = pgTable(
  'late_fee_policies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'cascade' }),
    type: lateFeePolicyTypeEnum('type').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }),
    percentBps: integer('percent_bps'),
    graceDays: integer('grace_days').notNull().default(0),
    maxFeePaise: bigint('max_fee_paise', { mode: 'number' }),
    appliesTo: lateFeeAppliesToEnum('applies_to').notNull().default('rent'),
    active: boolean('active').notNull().default(true),
    effectiveFrom: date('effective_from').notNull().default(sql`CURRENT_DATE`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('late_fee_policies_pg_active_idx').on(t.pgId, t.active, t.effectiveFrom),
  ],
);

export const lateFeeWaivers = pgTable(
  'late_fee_waivers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    rentInvoiceId: uuid('rent_invoice_id')
      .notNull()
      .references(() => rentInvoices.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    actorAdminId: uuid('actor_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('late_fee_waivers_invoice_idx').on(t.rentInvoiceId)],
);

export const collectionReminderTemplates = pgTable(
  'collection_reminder_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    key: text('key').notNull(),
    channel: collectionReminderChannelEnum('channel').notNull(),
    bodyText: text('body_text').notNull(),
    variables: jsonb('variables').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_reminder_templates_key_channel_uidx').on(t.key, t.channel),
  ],
);

export const collectionReminderPolicies = pgTable(
  'collection_reminder_policies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    channel: collectionReminderChannelEnum('channel').notNull().default('whatsapp'),
    offsetDays: integer('offset_days').notNull(),
    anchor: collectionReminderAnchorEnum('anchor').notNull(),
    templateKey: text('template_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('collection_reminder_policies_enabled_idx').on(t.enabled, t.offsetDays, t.anchor),
  ],
);

export const collectionReminderDeliveries = pgTable(
  'collection_reminder_deliveries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => collectionReminderPolicies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    rentInvoiceId: uuid('rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    channel: collectionReminderChannelEnum('channel').notNull(),
    status: collectionReminderDeliveryStatusEnum('status').notNull().default('pending'),
    providerRef: text('provider_ref'),
    error: text('error'),
    scheduledForDate: date('scheduled_for_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    index('collection_reminder_deliveries_scheduled_idx').on(t.scheduledForDate, t.status),
    index('collection_reminder_deliveries_customer_idx').on(t.customerId, t.createdAt),
  ],
);

export const paymentReceipts = pgTable(
  'payment_receipts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    receiptNumber: text('receipt_number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    financialInvoiceId: uuid('financial_invoice_id')
      .notNull()
      .references(() => financialInvoices.id, { onDelete: 'restrict' }),
    rentInvoiceId: uuid('rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    proofApprovalId: uuid('proof_approval_id').references(() => pgPaymentRecords.id, {
      onDelete: 'set null',
    }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    method: text('method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    collectedByAdminId: uuid('collected_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    transactionRef: text('transaction_ref'),
    shareToken: text('share_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_receipts_receipt_number_uidx').on(t.receiptNumber),
    uniqueIndex('payment_receipts_share_token_uidx').on(t.shareToken),
    index('payment_receipts_customer_idx').on(t.customerId, t.createdAt),
    index('payment_receipts_booking_idx').on(t.bookingId),
    index('payment_receipts_financial_invoice_idx').on(t.financialInvoiceId),
  ],
);

export type LateFeePolicy = typeof lateFeePolicies.$inferSelect;
export type LateFeeWaiver = typeof lateFeeWaivers.$inferSelect;
export type CollectionReminderPolicy = typeof collectionReminderPolicies.$inferSelect;
export type CollectionReminderTemplate = typeof collectionReminderTemplates.$inferSelect;
export type CollectionReminderDelivery = typeof collectionReminderDeliveries.$inferSelect;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;
