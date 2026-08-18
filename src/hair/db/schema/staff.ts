import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import type { FyhCommissionType } from './services';

export const fyhStaff = pgTable(
  'fyh_staff',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    photoUrl: text('photo_url'),
    role: text('role'),
    joiningDate: date('joining_date'),
    performanceTargetPaise: bigint('performance_target_paise', { mode: 'number' })
      .notNull()
      .default(0),
    isActive: boolean('is_active').notNull().default(true),
    defaultCommissionType: text('default_commission_type')
      .$type<FyhCommissionType>()
      .notNull()
      .default('none'),
    defaultCommissionFixedPaise: bigint('default_commission_fixed_paise', { mode: 'number' })
      .notNull()
      .default(0),
    defaultCommissionPercentBps: integer('default_commission_percent_bps').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_staff_active_idx').on(t.isActive),
    index('fyh_staff_name_idx').on(t.fullName),
  ],
);

export type FyhStaff = typeof fyhStaff.$inferSelect;
