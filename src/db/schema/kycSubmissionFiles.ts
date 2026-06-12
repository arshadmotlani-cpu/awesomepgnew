import { customType, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { kycSubmissions } from './kycSubmissions';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new Error('Unexpected bytea value from database.');
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
});

export const kycSubmissionFiles = pgTable(
  'kyc_submission_files',
  {
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => kycSubmissions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    content: bytea('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('kyc_submission_files_submission_kind_unique').on(t.submissionId, t.kind),
  ],
);

export type KycSubmissionFile = typeof kycSubmissionFiles.$inferSelect;
