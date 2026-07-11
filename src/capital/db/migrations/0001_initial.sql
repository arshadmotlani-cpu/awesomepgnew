-- Automotive Capital initial schema
CREATE TYPE "public"."ac_asset_class" AS ENUM('automotive', 'property', 'gold', 'machinery', 'business', 'loan');
CREATE TYPE "public"."ac_asset_status" AS ENUM('purchased', 'repairing', 'painting', 'ready', 'listed', 'sold', 'settled', 'cancelled');
CREATE TYPE "public"."ac_payment_type" AS ENUM('capital_returned', 'profit', 'adjustment', 'refund');
CREATE TYPE "public"."ac_payment_mode" AS ENUM('cash', 'upi', 'neft', 'rtgs', 'cheque', 'bank');
CREATE TYPE "public"."ac_document_type" AS ENUM('purchase_invoice', 'repair_bill', 'insurance', 'rc', 'photo', 'sale_invoice', 'other');
CREATE TYPE "public"."ac_ledger_entry_type" AS ENUM('capital_investment', 'asset_purchase', 'expense', 'payment_received', 'settlement', 'reversal', 'adjustment');
CREATE TYPE "public"."ac_ledger_direction" AS ENUM('debit', 'credit');

CREATE TABLE IF NOT EXISTS "ac_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_name" text DEFAULT 'Automotive Capital' NOT NULL,
  "logo_url" text,
  "profit_share_numerator" integer DEFAULT 1 NOT NULL,
  "profit_share_denominator" integer DEFAULT 2 NOT NULL,
  "currency_code" text DEFAULT 'INR' NOT NULL,
  "theme_tokens" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_admin_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name" text,
  "last_login_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL REFERENCES "ac_admin_users"("id") ON DELETE restrict,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_auth_sessions_token_idx" ON "ac_auth_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "ac_auth_sessions_admin_idx" ON "ac_auth_sessions" ("admin_user_id");

CREATE TABLE IF NOT EXISTS "ac_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_class" "ac_asset_class" DEFAULT 'automotive' NOT NULL,
  "status" "ac_asset_status" DEFAULT 'purchased' NOT NULL,
  "display_name" text NOT NULL,
  "purchase_date" date NOT NULL,
  "purchase_price_paise" bigint NOT NULL,
  "expected_sale_price_paise" bigint,
  "actual_sale_price_paise" bigint,
  "sale_date" date,
  "total_expense_paise" bigint DEFAULT 0 NOT NULL,
  "total_investment_paise" bigint DEFAULT 0 NOT NULL,
  "holding_days" integer,
  "profit_paise" bigint,
  "roi_bps" integer,
  "capital_returned_paise" bigint DEFAULT 0 NOT NULL,
  "profit_received_paise" bigint DEFAULT 0 NOT NULL,
  "outstanding_paise" bigint DEFAULT 0 NOT NULL,
  "settlement_pct_bps" integer,
  "notes" text,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_assets_status_idx" ON "ac_assets" ("status");
CREATE INDEX IF NOT EXISTS "ac_assets_class_status_idx" ON "ac_assets" ("asset_class", "status");
CREATE INDEX IF NOT EXISTS "ac_assets_purchase_date_idx" ON "ac_assets" ("purchase_date");

CREATE TABLE IF NOT EXISTS "ac_automotive_details" (
  "asset_id" uuid PRIMARY KEY NOT NULL REFERENCES "ac_assets"("id") ON DELETE restrict,
  "manufacturer" text NOT NULL,
  "model" text NOT NULL,
  "variant" text,
  "year" integer NOT NULL,
  "registration_number" text NOT NULL UNIQUE,
  "vin" text,
  "engine_number" text,
  "chassis_number" text,
  "color" text,
  "purchase_notes" text
);
CREATE INDEX IF NOT EXISTS "ac_auto_reg_idx" ON "ac_automotive_details" ("registration_number");
CREATE INDEX IF NOT EXISTS "ac_auto_manufacturer_idx" ON "ac_automotive_details" ("manufacturer");

CREATE TABLE IF NOT EXISTS "ac_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "kind" text DEFAULT 'expense' NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_capital_investments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invested_at" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "payment_mode" "ac_payment_mode" NOT NULL,
  "reference_number" text,
  "notes" text,
  "is_reversed" boolean DEFAULT false NOT NULL,
  "reversal_of_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "ac_assets"("id") ON DELETE restrict,
  "category_id" uuid NOT NULL REFERENCES "ac_categories"("id") ON DELETE restrict,
  "expense_date" date NOT NULL,
  "vendor" text,
  "amount_paise" bigint NOT NULL,
  "description" text NOT NULL,
  "payment_method" "ac_payment_mode",
  "notes" text,
  "is_reversed" boolean DEFAULT false NOT NULL,
  "reversal_of_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_expenses_asset_date_idx" ON "ac_expenses" ("asset_id", "expense_date");

CREATE TABLE IF NOT EXISTS "ac_payments_received" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid REFERENCES "ac_assets"("id") ON DELETE restrict,
  "received_at" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "payment_type" "ac_payment_type" NOT NULL,
  "capital_returned_paise" bigint DEFAULT 0 NOT NULL,
  "profit_paise" bigint DEFAULT 0 NOT NULL,
  "adjustment_paise" bigint DEFAULT 0 NOT NULL,
  "payment_mode" "ac_payment_mode" NOT NULL,
  "reference_number" text,
  "notes" text,
  "is_reversed" boolean DEFAULT false NOT NULL,
  "reversal_of_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_payments_asset_date_idx" ON "ac_payments_received" ("asset_id", "received_at");

CREATE TABLE IF NOT EXISTS "ac_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL UNIQUE REFERENCES "ac_assets"("id") ON DELETE restrict,
  "settled_at" date NOT NULL,
  "total_investment_paise" bigint NOT NULL,
  "total_received_paise" bigint NOT NULL,
  "gross_profit_paise" bigint NOT NULL,
  "admin_share_paise" bigint NOT NULL,
  "partner_share_paise" bigint NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_type" "ac_ledger_entry_type" NOT NULL,
  "direction" "ac_ledger_direction" NOT NULL,
  "amount_paise" bigint NOT NULL,
  "asset_id" uuid REFERENCES "ac_assets"("id") ON DELETE restrict,
  "source_table" text NOT NULL,
  "source_id" uuid NOT NULL,
  "reversal_of_entry_id" uuid,
  "description" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_ledger_asset_created_idx" ON "ac_ledger_entries" ("asset_id", "created_at");
CREATE INDEX IF NOT EXISTS "ac_ledger_type_created_idx" ON "ac_ledger_entries" ("entry_type", "created_at");

CREATE TABLE IF NOT EXISTS "ac_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid REFERENCES "ac_assets"("id") ON DELETE restrict,
  "expense_id" uuid REFERENCES "ac_expenses"("id") ON DELETE set null,
  "payment_id" uuid REFERENCES "ac_payments_received"("id") ON DELETE set null,
  "document_type" "ac_document_type" NOT NULL,
  "file_name" text NOT NULL,
  "blob_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ac_activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "before_state" jsonb,
  "after_state" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ac_activity_created_idx" ON "ac_activity_log" ("created_at");

CREATE TABLE IF NOT EXISTS "ac_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_key" text NOT NULL UNIQUE,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
