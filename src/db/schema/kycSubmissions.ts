import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { kycSubmissionStatusEnum } from './enums';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';

export type KycValidationReport = {
  aadhaarFront?: Record<string, unknown>;
  aadhaarBack?: Record<string, unknown>;
  selfie?: Record<string, unknown>;
};

export const kycSubmissions = pgTable('kyc_submissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  aadhaarFrontPath: text('aadhaar_front_path').notNull(),
  aadhaarBackPath: text('aadhaar_back_path').notNull(),
  selfiePath: text('selfie_path').notNull(),
  status: kycSubmissionStatusEnum('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  validationReport: jsonb('validation_report').$type<KycValidationReport>().notNull().default({}),
  reviewedByAdminId: uuid('reviewed_by_admin_id').references(() => adminUsers.id, {
    onDelete: 'set null',
  }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type NewKycSubmission = typeof kycSubmissions.$inferInsert;
