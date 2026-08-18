-- Phase 0B: per-organization unique indexes (requires backfill complete)

DROP INDEX IF EXISTS fyh_invoices_number_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_org_number_uidx
  ON fyh_invoices (organization_id, invoice_number);

DROP INDEX IF EXISTS fyh_customers_code_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_customers_org_code_uidx
  ON fyh_customers (organization_id, customer_code)
  WHERE customer_code IS NOT NULL;

DROP INDEX IF EXISTS fyh_invoices_import_row_key_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_org_import_row_key_uidx
  ON fyh_invoices (organization_id, import_row_key)
  WHERE import_row_key IS NOT NULL;

DROP INDEX IF EXISTS fyh_customers_phone_active_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_customers_org_phone_uidx
  ON fyh_customers (organization_id, phone)
  WHERE phone IS NOT NULL AND is_active = true;

ALTER TABLE fyh_service_categories DROP CONSTRAINT IF EXISTS fyh_service_categories_name_key;
ALTER TABLE fyh_service_categories DROP CONSTRAINT IF EXISTS fyh_service_categories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_service_categories_org_name_uidx
  ON fyh_service_categories (organization_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS fyh_service_categories_org_slug_uidx
  ON fyh_service_categories (organization_id, slug);

ALTER TABLE fyh_brands DROP CONSTRAINT IF EXISTS fyh_brands_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_brands_org_name_uidx
  ON fyh_brands (organization_id, name);

ALTER TABLE fyh_notification_templates DROP CONSTRAINT IF EXISTS fyh_notification_templates_kind_key;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_notification_templates_org_kind_uidx
  ON fyh_notification_templates (organization_id, kind);

DROP INDEX IF EXISTS fyh_credit_notes_number_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_credit_notes_org_number_uidx
  ON fyh_credit_notes (organization_id, credit_note_number);

ALTER TABLE fyh_purchases DROP CONSTRAINT IF EXISTS fyh_purchases_purchase_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_purchases_org_purchase_number_uidx
  ON fyh_purchases (organization_id, purchase_number);

DROP INDEX IF EXISTS wf_employees_email_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS wf_employees_org_email_uidx
  ON wf_employees (organization_id, email)
  WHERE email IS NOT NULL;

DROP INDEX IF EXISTS wf_employees_mobile_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS wf_employees_org_mobile_uidx
  ON wf_employees (organization_id, mobile)
  WHERE mobile IS NOT NULL;

-- platform.users.email remains globally unique (SSOT identity)
