import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { fyhInvoiceLines } from './billing';
import { fyhStaff } from './staff';

export const FYH_ATTRIBUTION_ROLES = ['serviced_by', 'sold_by'] as const;
export type FyhAttributionRole = (typeof FYH_ATTRIBUTION_ROLES)[number];

export const FYH_REVENUE_METRICS = ['service', 'product', 'package', 'membership'] as const;
export type FyhRevenueMetric = (typeof FYH_REVENUE_METRICS)[number];

export const fyhInvoiceLineAttributions = pgTable(
  'fyh_invoice_line_attributions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => fyhInvoiceLines.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => fyhStaff.id, { onDelete: 'restrict' }),
    role: text('role').$type<FyhAttributionRole>().notNull(),
    shareBps: integer('share_bps').notNull().default(10_000),
    attributedNetPaise: bigint('attributed_net_paise', { mode: 'number' }).notNull().default(0),
    revenueMetric: text('revenue_metric').$type<FyhRevenueMetric>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_invoice_line_attr_line_idx').on(t.invoiceLineId),
    index('fyh_invoice_line_attr_staff_metric_idx').on(t.staffId, t.revenueMetric, t.createdAt),
  ],
);

export const FYH_COMMISSION_RULE_SCOPES = [
  'service',
  'product',
  'package',
  'membership',
  'global',
] as const;
export type FyhCommissionRuleScope = (typeof FYH_COMMISSION_RULE_SCOPES)[number];

export const FYH_COMMISSION_RULE_TYPES = [
  'flat_percent',
  'flat_amount',
  'tiered_percent',
  'fixed_bonus',
] as const;
export type FyhCommissionRuleType = (typeof FYH_COMMISSION_RULE_TYPES)[number];

export const fyhCommissionRules = pgTable(
  'fyh_commission_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    scope: text('scope').$type<FyhCommissionRuleScope>().notNull(),
    scopeRefId: uuid('scope_ref_id'),
    ruleType: text('rule_type').$type<FyhCommissionRuleType>().notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_commission_rules_scope_idx').on(t.scope, t.scopeRefId, t.isActive)],
);

export type FyhInvoiceLineAttribution = typeof fyhInvoiceLineAttributions.$inferSelect;
export type NewFyhInvoiceLineAttribution = typeof fyhInvoiceLineAttributions.$inferInsert;
export type FyhCommissionRule = typeof fyhCommissionRules.$inferSelect;
