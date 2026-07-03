import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import {
  paymentProofEntityTypeEnum,
  paymentProofRejectionStatusEnum,
} from './enums';
import { pgs } from './pgs';

export const paymentProofRejections = pgTable(
  'payment_proof_rejections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    reviewKey: text('review_key').notNull(),
    entityType: paymentProofEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    reasonCode: text('reason_code').notNull(),
    reasonLabel: text('reason_label').notNull(),
    reasonDetail: text('reason_detail'),
    adminNote: text('admin_note'),
    residentMessage: text('resident_message').notNull(),
    rejectedByAdminId: uuid('rejected_by_admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull().defaultNow(),
    whatsappSent: boolean('whatsapp_sent').notNull().default(false),
    whatsappMessagePreview: text('whatsapp_message_preview'),
    status: paymentProofRejectionStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_proof_rejections_entity_idx').on(t.entityType, t.entityId, t.status),
    index('payment_proof_rejections_customer_idx').on(t.customerId, t.status, t.rejectedAt),
    index('payment_proof_rejections_review_key_idx').on(t.reviewKey),
  ],
);

export type PaymentProofRejection = typeof paymentProofRejections.$inferSelect;
export type NewPaymentProofRejection = typeof paymentProofRejections.$inferInsert;
