-- Owner OS Wealth Operating System — foundation schema

CREATE TYPE "oo_source_system" AS ENUM (
  'OWNER_OS', 'AWESOME_PG', 'FYHAIR', 'CAPITAL', 'WORKFORCE', 'OTHER'
);
CREATE TYPE "oo_economic_event_type" AS ENUM (
  'INCOME', 'EXPENSE', 'ASSET_PURCHASE', 'LIABILITY_PAYMENT',
  'TRANSFER', 'VALUATION_ADJUSTMENT', 'LIABILITY_ACCRUAL', 'OPENING_BALANCE'
);
CREATE TYPE "oo_asset_type" AS ENUM (
  'CASH', 'BANK', 'PROPERTY', 'INVESTMENT_LINK', 'VEHICLE_LINK', 'BUSINESS_INTEREST', 'OTHER'
);
CREATE TYPE "oo_liability_type" AS ENUM (
  'EMI', 'INTEREST_ONLY', 'DAILY_INTEREST', 'MONTHLY_INTEREST', 'FIXED_SCHEDULE', 'CUSTOM'
);
CREATE TYPE "oo_payment_allocation_mode" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "oo_integration_fact_kind" AS ENUM (
  'REVENUE', 'EXPENSE', 'PROFIT', 'ASSET_VALUE', 'LIABILITY', 'OTHER'
);
CREATE TYPE "oo_valuation_kind" AS ENUM ('ACTUAL', 'APPRAISAL', 'MARKET_ESTIMATE', 'PROJECTED');
CREATE TYPE "oo_schedule_status" AS ENUM ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'SKIPPED');
CREATE TYPE "oo_expense_category" AS ENUM (
  'PERSONAL', 'PROPERTY', 'BUSINESS', 'INVESTMENT', 'LOAN_INTEREST', 'TAXES', 'REPAIRS', 'MAINTENANCE', 'OTHER'
);
CREATE TYPE "oo_recurring_frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

CREATE TABLE IF NOT EXISTS "oo_financial_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "account_type" text DEFAULT 'bank' NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "notes" text,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_financial_accounts_active_idx" ON "oo_financial_accounts" ("is_active");

CREATE TABLE IF NOT EXISTS "oo_businesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "source_system" "oo_source_system" DEFAULT 'OWNER_OS' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "oo_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "asset_type" "oo_asset_type" NOT NULL,
  "ownership_pct_bps" integer DEFAULT 10000 NOT NULL,
  "business_id" uuid REFERENCES "oo_businesses"("id") ON DELETE set null,
  "linked_pg_id" uuid,
  "linked_capital_asset_id" uuid,
  "notes" text,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_assets_type_idx" ON "oo_assets" ("asset_type");
CREATE INDEX IF NOT EXISTS "oo_assets_pg_idx" ON "oo_assets" ("linked_pg_id");

CREATE TABLE IF NOT EXISTS "oo_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "oo_assets"("id") ON DELETE cascade,
  "property_type" text DEFAULT 'residential' NOT NULL,
  "address" text,
  "city" text,
  "state" text,
  "purchase_date" date,
  "purchase_price_paise" bigint DEFAULT 0 NOT NULL,
  "purchase_costs_paise" bigint DEFAULT 0 NOT NULL,
  "linked_pg_id" uuid,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oo_properties_asset_idx" ON "oo_properties" ("asset_id");

CREATE TABLE IF NOT EXISTS "oo_property_valuations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "oo_assets"("id") ON DELETE cascade,
  "valuation_date" date NOT NULL,
  "value_paise" bigint NOT NULL,
  "kind" "oo_valuation_kind" DEFAULT 'MARKET_ESTIMATE' NOT NULL,
  "notes" text,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_property_valuations_asset_date_idx" ON "oo_property_valuations" ("asset_id", "valuation_date");
CREATE INDEX IF NOT EXISTS "oo_property_valuations_kind_idx" ON "oo_property_valuations" ("kind");

CREATE TABLE IF NOT EXISTS "oo_property_appreciation_assumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "oo_assets"("id") ON DELETE cascade,
  "annual_rate_bps" integer NOT NULL,
  "effective_from" date NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_property_appreciation_asset_idx" ON "oo_property_appreciation_assumptions" ("asset_id", "effective_from");

CREATE TABLE IF NOT EXISTS "oo_liabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "lender" text,
  "liability_type" "oo_liability_type" NOT NULL,
  "original_principal_paise" bigint NOT NULL,
  "current_principal_paise" bigint NOT NULL,
  "interest_rate_bps" integer DEFAULT 0 NOT NULL,
  "start_date" date,
  "first_payment_date" date,
  "end_date" date,
  "tenure_months" integer,
  "repayment_frequency" text DEFAULT 'monthly',
  "fixed_payment_paise" bigint,
  "accrued_interest_paise" bigint DEFAULT 0 NOT NULL,
  "last_accrual_date" date,
  "asset_id" uuid REFERENCES "oo_assets"("id") ON DELETE set null,
  "business_id" uuid REFERENCES "oo_businesses"("id") ON DELETE set null,
  "rules_json" jsonb DEFAULT '{}',
  "notes" text,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_liabilities_type_idx" ON "oo_liabilities" ("liability_type");
CREATE INDEX IF NOT EXISTS "oo_liabilities_asset_idx" ON "oo_liabilities" ("asset_id");
CREATE INDEX IF NOT EXISTS "oo_liabilities_active_idx" ON "oo_liabilities" ("is_active");

CREATE TABLE IF NOT EXISTS "oo_liability_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "liability_id" uuid NOT NULL REFERENCES "oo_liabilities"("id") ON DELETE cascade,
  "due_date" date NOT NULL,
  "principal_due_paise" bigint DEFAULT 0 NOT NULL,
  "interest_due_paise" bigint DEFAULT 0 NOT NULL,
  "principal_paid_paise" bigint DEFAULT 0 NOT NULL,
  "interest_paid_paise" bigint DEFAULT 0 NOT NULL,
  "status" "oo_schedule_status" DEFAULT 'UPCOMING' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_liability_schedules_due_idx" ON "oo_liability_schedules" ("due_date");
CREATE INDEX IF NOT EXISTS "oo_liability_schedules_liability_idx" ON "oo_liability_schedules" ("liability_id", "due_date");
CREATE INDEX IF NOT EXISTS "oo_liability_schedules_status_idx" ON "oo_liability_schedules" ("status");

CREATE TABLE IF NOT EXISTS "oo_liability_accruals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "liability_id" uuid NOT NULL REFERENCES "oo_liabilities"("id") ON DELETE cascade,
  "accrual_date" date NOT NULL,
  "interest_accrued_paise" bigint NOT NULL,
  "principal_balance_paise" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oo_liability_accruals_unique" ON "oo_liability_accruals" ("liability_id", "accrual_date");
CREATE INDEX IF NOT EXISTS "oo_liability_accruals_date_idx" ON "oo_liability_accruals" ("accrual_date");

CREATE TABLE IF NOT EXISTS "oo_journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_date" date NOT NULL,
  "description" text NOT NULL,
  "source_system" "oo_source_system" DEFAULT 'OWNER_OS' NOT NULL,
  "external_ref" text,
  "event_type" "oo_economic_event_type" NOT NULL,
  "reversal_of_id" uuid,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oo_journal_entries_external_ref_idx" ON "oo_journal_entries" ("source_system", "external_ref");
CREATE INDEX IF NOT EXISTS "oo_journal_entries_date_idx" ON "oo_journal_entries" ("entry_date");
CREATE INDEX IF NOT EXISTS "oo_journal_entries_type_idx" ON "oo_journal_entries" ("event_type");
CREATE INDEX IF NOT EXISTS "oo_journal_entries_source_idx" ON "oo_journal_entries" ("source_system");

CREATE TABLE IF NOT EXISTS "oo_journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL REFERENCES "oo_journal_entries"("id") ON DELETE cascade,
  "amount_paise" bigint NOT NULL,
  "event_type" "oo_economic_event_type" NOT NULL,
  "category" "oo_expense_category",
  "subcategory" text,
  "account_id" uuid REFERENCES "oo_financial_accounts"("id") ON DELETE set null,
  "asset_id" uuid REFERENCES "oo_assets"("id") ON DELETE set null,
  "liability_id" uuid REFERENCES "oo_liabilities"("id") ON DELETE set null,
  "business_id" uuid REFERENCES "oo_businesses"("id") ON DELETE set null,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_journal_lines_entry_idx" ON "oo_journal_lines" ("entry_id");
CREATE INDEX IF NOT EXISTS "oo_journal_lines_account_idx" ON "oo_journal_lines" ("account_id");
CREATE INDEX IF NOT EXISTS "oo_journal_lines_asset_idx" ON "oo_journal_lines" ("asset_id");
CREATE INDEX IF NOT EXISTS "oo_journal_lines_liability_idx" ON "oo_journal_lines" ("liability_id");
CREATE INDEX IF NOT EXISTS "oo_journal_lines_type_idx" ON "oo_journal_lines" ("event_type");

CREATE TABLE IF NOT EXISTS "oo_journal_line_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_line_id" uuid NOT NULL REFERENCES "oo_journal_lines"("id") ON DELETE cascade,
  "interest_paise" bigint DEFAULT 0 NOT NULL,
  "principal_paise" bigint DEFAULT 0 NOT NULL,
  "allocation_mode" "oo_payment_allocation_mode" DEFAULT 'AUTO' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oo_journal_line_allocations_line_idx" ON "oo_journal_line_allocations" ("journal_line_id");

CREATE TABLE IF NOT EXISTS "oo_integration_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_system" "oo_source_system" NOT NULL,
  "external_ref" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "kind" "oo_integration_fact_kind" NOT NULL,
  "amount_paise" bigint NOT NULL,
  "asset_id" uuid REFERENCES "oo_assets"("id") ON DELETE set null,
  "liability_id" uuid REFERENCES "oo_liabilities"("id") ON DELETE set null,
  "business_id" uuid REFERENCES "oo_businesses"("id") ON DELETE set null,
  "metadata_json" jsonb DEFAULT '{}',
  "synced_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oo_integration_facts_ref_idx" ON "oo_integration_facts" ("source_system", "external_ref");
CREATE INDEX IF NOT EXISTS "oo_integration_facts_period_idx" ON "oo_integration_facts" ("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "oo_integration_facts_kind_idx" ON "oo_integration_facts" ("kind");

CREATE TABLE IF NOT EXISTS "oo_recurring_obligations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "frequency" "oo_recurring_frequency" DEFAULT 'MONTHLY' NOT NULL,
  "category" "oo_expense_category" DEFAULT 'OTHER' NOT NULL,
  "next_due_date" date,
  "account_id" uuid REFERENCES "oo_financial_accounts"("id") ON DELETE set null,
  "asset_id" uuid REFERENCES "oo_assets"("id") ON DELETE set null,
  "liability_id" uuid REFERENCES "oo_liabilities"("id") ON DELETE set null,
  "business_id" uuid REFERENCES "oo_businesses"("id") ON DELETE set null,
  "notes" text,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_recurring_obligations_due_idx" ON "oo_recurring_obligations" ("next_due_date");
CREATE INDEX IF NOT EXISTS "oo_recurring_obligations_active_idx" ON "oo_recurring_obligations" ("is_active");

CREATE TABLE IF NOT EXISTS "oo_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text,
  "mime_type" text,
  "created_by" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_attachments_entity_idx" ON "oo_attachments" ("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "oo_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" text NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "actor_id" uuid REFERENCES "oo_admin_users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oo_audit_log_entity_idx" ON "oo_audit_log" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "oo_audit_log_created_idx" ON "oo_audit_log" ("created_at");

-- Seed default businesses
INSERT INTO "oo_businesses" ("name", "slug", "source_system")
VALUES
  ('Personal', 'personal', 'OWNER_OS'),
  ('Awesome PG', 'awesome-pg', 'AWESOME_PG'),
  ('FYHAIR', 'fyhair', 'FYHAIR'),
  ('Automotive Capital', 'automotive-capital', 'CAPITAL')
ON CONFLICT ("slug") DO NOTHING;
