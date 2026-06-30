import { sql } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { electricityBills } from './electricityBills';
import { rooms } from './rooms';

export const electricityBillGenerationJobStatusEnum = pgEnum(
  'electricity_bill_generation_job_status',
  ['running', 'success', 'failed', 'duplicate'],
);

export const electricityBillGenerationJobs = pgTable(
  'electricity_bill_generation_jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    requestId: text('request_id').notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    adminId: uuid('admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    status: electricityBillGenerationJobStatusEnum('status').notNull().default('running'),
    billId: uuid('bill_id').references(() => electricityBills.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('electricity_bill_generation_jobs_request_id_unique').on(t.requestId),
    uniqueIndex('electricity_bill_generation_jobs_active_room_month_unique')
      .on(t.roomId, t.billingMonth)
      .where(sql`${t.status} = 'running'`),
    index('electricity_bill_generation_jobs_room_month_idx').on(
      t.roomId,
      t.billingMonth,
      t.startedAt,
    ),
  ],
);

export type ElectricityBillGenerationJob = typeof electricityBillGenerationJobs.$inferSelect;
