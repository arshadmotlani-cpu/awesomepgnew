-- Phase B: backfill NULL tenant keys, wf_auth_sessions.organization_id, then SET NOT NULL.
-- Non-NULL organization_id values are left unchanged (integration-test orgs stay).
-- FYH_SAAS_TENANT is not enabled by this migration.

ALTER TABLE wf_auth_sessions ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE TEMP TABLE _phase_b_ids AS
SELECT
  COALESCE(
    (SELECT organization_id FROM wf_employees WHERE organization_id IS NOT NULL ORDER BY created_at LIMIT 1),
    (SELECT organization_id FROM fyh_settings WHERE organization_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1),
    (SELECT organization_id FROM fyh_admin_users WHERE organization_id IS NOT NULL LIMIT 1)
  ) AS org_id,
  COALESCE(
    (SELECT location_id FROM fyh_appointments WHERE location_id IS NOT NULL ORDER BY created_at LIMIT 1),
    (SELECT location_id FROM fyh_invoices WHERE location_id IS NOT NULL LIMIT 1),
    (SELECT location_id FROM fyh_staff_locations WHERE location_id IS NOT NULL LIMIT 1)
  ) AS loc_id;

UPDATE fyh_customers c
SET is_active = false
WHERE c.organization_id IS NULL
  AND c.phone IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM fyh_customers x
    WHERE x.organization_id = (SELECT org_id FROM _phase_b_ids)
      AND x.phone = c.phone
      AND x.is_active = true
  );

UPDATE fyh_customers c
SET customer_code = NULL
WHERE c.organization_id IS NULL
  AND c.customer_code IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM fyh_customers x
    WHERE x.organization_id = (SELECT org_id FROM _phase_b_ids)
      AND x.customer_code = c.customer_code
  );

UPDATE fyh_invoices i
SET invoice_number = i.invoice_number || '-phb-' || substr(replace(i.id::text, '-', ''), 1, 8)
WHERE i.organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM fyh_invoices x
    WHERE x.organization_id = (SELECT org_id FROM _phase_b_ids)
      AND x.invoice_number = i.invoice_number
  );

UPDATE fyh_admin_users SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_auth_sessions SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_settings SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_customers SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_customer_notes SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_customer_timeline SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_financial_ledger SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_staff SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_service_categories SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_services SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_service_staff SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_service_consumables SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_commission_rules SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_brands SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_products SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_vendors SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_vendor_notes SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_vendor_payables SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_vendor_payments SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_vendor_payment_allocations SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_membership_plans SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_customer_memberships SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_package_plans SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_customer_packages SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_bridal_profiles SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_bridal_events SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_notification_templates SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_notification_outbox SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_historical_import_batches SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_historical_import_row_errors SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_engine_memberships SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_permission_grants SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_role_templates SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_payroll_runs SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_payroll_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_incentive_plans SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_incentives SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_audit_log SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_events SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_employees SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;

UPDATE wf_auth_sessions s
SET organization_id = COALESCE(e.organization_id, (SELECT org_id FROM _phase_b_ids))
FROM wf_employees e
WHERE s.employee_id = e.id AND s.organization_id IS NULL;

UPDATE wf_auth_sessions SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;

UPDATE fyh_staff_schedules SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_staff_schedules SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_resources SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_resources SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_appointments SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_appointments SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_appointment_services SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_appointment_services SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_invoices SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_invoices SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_invoice_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_invoice_lines SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_invoice_payments SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_invoice_payments SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_credit_notes SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_credit_notes SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_invoice_line_attributions SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_invoice_line_attributions SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_commission_entries SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_commission_entries SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_stock_movements SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_stock_movements SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_stock_adjustments SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_stock_adjustments SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_floor_issues SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_floor_issues SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_product_batches SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_product_batches SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_orders SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_orders SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_order_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_order_lines SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_goods_receipts SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_goods_receipts SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_goods_receipt_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_goods_receipt_lines SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchases SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchases SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_lines SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_returns SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_returns SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_return_lines SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_return_lines SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_purchase_audit_events SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_purchase_audit_events SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE fyh_expenses SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE fyh_expenses SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE wf_schedules SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_schedules SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;
UPDATE wf_attendance SET organization_id = (SELECT org_id FROM _phase_b_ids) WHERE organization_id IS NULL;
UPDATE wf_attendance SET location_id = (SELECT loc_id FROM _phase_b_ids) WHERE location_id IS NULL;

DELETE FROM fyh_settings a
USING fyh_settings b
WHERE a.organization_id IS NOT NULL
  AND a.organization_id = b.organization_id
  AND a.id < b.id;

CREATE TABLE IF NOT EXISTS fyh_tenant_mirror (
  organization_id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fyh_tenant_mirror (organization_id, display_name)
SELECT DISTINCT organization_id, 'Hair org'
FROM (
  SELECT organization_id FROM wf_employees WHERE organization_id IS NOT NULL
  UNION
  SELECT organization_id FROM fyh_settings WHERE organization_id IS NOT NULL
  UNION
  SELECT organization_id FROM fyh_admin_users WHERE organization_id IS NOT NULL
) src
ON CONFLICT (organization_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_settings_org_uidx ON fyh_settings (organization_id);
CREATE INDEX IF NOT EXISTS wf_auth_sessions_organization_id_idx ON wf_auth_sessions (organization_id);

ALTER TABLE fyh_admin_users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_auth_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_customers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_customer_notes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_customer_timeline ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_financial_ledger ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_staff ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_service_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_services ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_service_staff ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_service_consumables ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_commission_rules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_brands ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_products ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_vendors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_vendor_notes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_vendor_payables ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_vendor_payments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_vendor_payment_allocations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_membership_plans ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_customer_memberships ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_package_plans ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_customer_packages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_bridal_profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_bridal_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_notification_templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_notification_outbox ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_historical_import_batches ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_historical_import_row_errors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_engine_memberships ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_permission_grants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_role_templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_payroll_runs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_payroll_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_incentive_plans ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_incentives ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_audit_log ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_staff_schedules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_staff_schedules ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_resources ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_resources ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_appointments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_appointments ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_appointment_services ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_appointment_services ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_invoices ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_invoices ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_invoice_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_invoice_lines ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_invoice_payments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_invoice_payments ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_credit_notes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_credit_notes ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_invoice_line_attributions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_invoice_line_attributions ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_commission_entries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_commission_entries ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_stock_movements ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_stock_movements ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_stock_adjustments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_stock_adjustments ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_floor_issues ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_floor_issues ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_product_batches ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_product_batches ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_orders ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_orders ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_order_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_order_lines ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_goods_receipts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_goods_receipts ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_goods_receipt_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_goods_receipt_lines ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchases ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchases ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_lines ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_returns ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_returns ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_return_lines ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_return_lines ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_purchase_audit_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_purchase_audit_events ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE fyh_expenses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fyh_expenses ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE wf_schedules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_schedules ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE wf_attendance ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_attendance ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE wf_employees ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wf_auth_sessions ALTER COLUMN organization_id SET NOT NULL;

CREATE OR REPLACE FUNCTION fyh_default_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM wf_employees ORDER BY created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fyh_default_location_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT location_id FROM fyh_appointments WHERE location_id IS NOT NULL ORDER BY created_at LIMIT 1
$$;

