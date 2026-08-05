import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  WorkforceEmployeeStatus,
  WorkforceEngineId,
  WorkforceGender,
  WorkforceJobRole,
  WorkforcePermissionKey,
  WorkforceRank,
} from '@/src/workforce/types';

export const wfEmployees = pgTable(
  'wf_employees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fullName: text('full_name').notNull(),
    mobile: text('mobile'),
    email: text('email'),
    passwordHash: text('password_hash'),
    canLogin: boolean('can_login').notNull().default(false),
    gender: text('gender').$type<WorkforceGender>().notNull().default('unspecified'),
    emergencyContact: text('emergency_contact'),
    joiningDate: date('joining_date'),
    aadhaarNumber: text('aadhaar_number'),
    panNumber: text('pan_number'),
    salaryPaise: bigint('salary_paise', { mode: 'number' }).notNull().default(0),
    upiId: text('upi_id'),
    qrCodeUrl: text('qr_code_url'),
    photoUrl: text('photo_url'),
    status: text('status').$type<WorkforceEmployeeStatus>().notNull().default('active'),
    legacyAdminUserId: uuid('legacy_admin_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_employees_mobile_uidx').on(t.mobile),
    index('wf_employees_status_idx').on(t.status),
    index('wf_employees_legacy_admin_idx').on(t.legacyAdminUserId),
  ],
);

export const wfEngineMemberships = pgTable(
  'wf_engine_memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').$type<WorkforceEngineId>().notNull(),
    rank: text('rank').$type<WorkforceRank>().notNull().default('team_member'),
    jobRole: text('job_role').$type<WorkforceJobRole>().notNull().default('stylist'),
    isActive: boolean('is_active').notNull().default(true),
    /** Salon commission defaults until payroll Brain owns them */
    defaultCommissionType: text('default_commission_type').notNull().default('none'),
    defaultCommissionFixedPaise: bigint('default_commission_fixed_paise', { mode: 'number' })
      .notNull()
      .default(0),
    defaultCommissionPercentBps: integer('default_commission_percent_bps').notNull().default(0),
    performanceTargetPaise: bigint('performance_target_paise', { mode: 'number' })
      .notNull()
      .default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_membership_employee_engine_uidx').on(t.employeeId, t.engineId),
    index('wf_membership_engine_idx').on(t.engineId, t.isActive),
  ],
);

export const wfPermissionGrants = pgTable(
  'wf_permission_grants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => wfEngineMemberships.id, { onDelete: 'cascade' }),
    permissions: jsonb('permissions').$type<WorkforcePermissionKey[]>().notNull().default([]),
    maxBackdateDays: integer('max_backdate_days'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wf_permission_membership_uidx').on(t.membershipId)],
);

export const wfSchedules = pgTable(
  'wf_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').$type<WorkforceEngineId>().notNull().default('fyh_salon'),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull().default('10:00'),
    endTime: text('end_time').notNull().default('19:00'),
    lunchStart: text('lunch_start'),
    lunchEnd: text('lunch_end'),
    isOff: boolean('is_off').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_schedules_employee_engine_day_uidx').on(t.employeeId, t.engineId, t.dayOfWeek),
  ],
);

export const wfAttendance = pgTable(
  'wf_attendance',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').$type<WorkforceEngineId>().notNull(),
    workDate: date('work_date').notNull(),
    clockInAt: timestamp('clock_in_at', { withTimezone: true }),
    clockOutAt: timestamp('clock_out_at', { withTimezone: true }),
    status: text('status').notNull().default('present'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_attendance_employee_engine_date_uidx').on(
      t.employeeId,
      t.engineId,
      t.workDate,
    ),
  ],
);

/** Payroll foundation — draft runs; calculation expands later. */
export const wfPayrollRuns = pgTable('wf_payroll_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineId: text('engine_id').$type<WorkforceEngineId>().notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wfPayrollLines = pgTable(
  'wf_payroll_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    payrollRunId: uuid('payroll_run_id')
      .notNull()
      .references(() => wfPayrollRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    salaryPaise: bigint('salary_paise', { mode: 'number' }).notNull().default(0),
    commissionPaise: bigint('commission_paise', { mode: 'number' }).notNull().default(0),
    incentivePaise: bigint('incentive_paise', { mode: 'number' }).notNull().default(0),
    deductionsPaise: bigint('deductions_paise', { mode: 'number' }).notNull().default(0),
    netPaise: bigint('net_paise', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_payroll_lines_run_employee_uidx').on(t.payrollRunId, t.employeeId),
    index('wf_payroll_lines_employee_idx').on(t.employeeId),
  ],
);

export const wfIncentives = pgTable(
  'wf_incentives',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').$type<WorkforceEngineId>().notNull(),
    label: text('label').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    effectiveDate: date('effective_date').notNull(),
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    createdByEmployeeId: uuid('created_by_employee_id').references(() => wfEmployees.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wf_incentives_employee_engine_idx').on(t.employeeId, t.engineId, t.effectiveDate),
    index('wf_incentives_engine_status_idx').on(t.engineId, t.status),
  ],
);

export const wfAuthSessions = pgTable(
  'wf_auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => wfEmployees.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    activeEngineId: text('active_engine_id').$type<WorkforceEngineId>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wf_auth_sessions_token_idx').on(t.tokenHash),
    index('wf_auth_sessions_employee_idx').on(t.employeeId),
  ],
);

export const wfAuditLog = pgTable(
  'wf_audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id').references(() => wfEmployees.id, { onDelete: 'set null' }),
    actorEmployeeId: uuid('actor_employee_id').references(() => wfEmployees.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wf_audit_employee_idx').on(t.employeeId)],
);

export const wfEvents = pgTable(
  'wf_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id').notNull().default(sql`gen_random_uuid()`),
    eventType: text('event_type').notNull(),
    employeeId: uuid('employee_id'),
    engineId: text('engine_id').$type<WorkforceEngineId>(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    sourceRef: text('source_ref').notNull().default(''),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wf_events_event_id_uidx').on(t.eventId),
    index('wf_events_type_idx').on(t.eventType),
  ],
);

export type WfEmployee = typeof wfEmployees.$inferSelect;
export type WfEngineMembership = typeof wfEngineMemberships.$inferSelect;
