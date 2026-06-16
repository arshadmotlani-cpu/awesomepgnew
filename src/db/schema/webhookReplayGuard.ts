import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const webhookReplayGuard = pgTable(
  'webhook_replay_guard',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    webhookKind: text('webhook_kind').notNull(),
    signatureDigest: text('signature_digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('webhook_replay_guard_kind_digest_unique').on(
      t.webhookKind,
      t.signatureDigest,
    ),
    index('webhook_replay_guard_created_idx').on(t.createdAt),
  ],
);
