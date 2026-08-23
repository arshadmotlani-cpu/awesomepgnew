/**
 * Read-only Phase B preflight: row counts + NULL tenant keys on Hair DB.
 * Does not apply migrations.
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

const ORG_TABLES = [
  'fyh_admin_users',
  'fyh_auth_sessions',
  'fyh_settings',
  'fyh_customers',
  'fyh_customer_notes',
  'fyh_customer_timeline',
  'fyh_financial_ledger',
  'fyh_staff',
  'fyh_service_categories',
  'fyh_services',
  'fyh_service_staff',
  'fyh_service_consumables',
  'fyh_commission_rules',
  'fyh_brands',
  'fyh_products',
  'fyh_vendors',
  'fyh_vendor_notes',
  'fyh_vendor_payables',
  'fyh_vendor_payments',
  'fyh_vendor_payment_allocations',
  'fyh_membership_plans',
  'fyh_customer_memberships',
  'fyh_package_plans',
  'fyh_customer_packages',
  'fyh_bridal_profiles',
  'fyh_bridal_events',
  'fyh_notification_templates',
  'fyh_notification_outbox',
  'fyh_historical_import_batches',
  'fyh_historical_import_row_errors',
  'wf_engine_memberships',
  'wf_permission_grants',
  'wf_role_templates',
  'wf_payroll_runs',
  'wf_payroll_lines',
  'wf_incentive_plans',
  'wf_incentives',
  'wf_audit_log',
  'wf_events',
  'wf_employees',
  'wf_auth_sessions',
  'fyh_staff_schedules',
  'fyh_resources',
  'fyh_appointments',
  'fyh_appointment_services',
  'fyh_invoices',
  'fyh_invoice_lines',
  'fyh_invoice_payments',
  'fyh_credit_notes',
  'fyh_invoice_line_attributions',
  'fyh_commission_entries',
  'fyh_stock_movements',
  'fyh_stock_adjustments',
  'fyh_floor_issues',
  'fyh_product_batches',
  'fyh_purchase_orders',
  'fyh_purchase_order_lines',
  'fyh_goods_receipts',
  'fyh_goods_receipt_lines',
  'fyh_purchases',
  'fyh_purchase_lines',
  'fyh_purchase_returns',
  'fyh_purchase_return_lines',
  'fyh_purchase_audit_events',
  'fyh_expenses',
  'wf_schedules',
  'wf_attendance',
] as const;

const LOCATION_TABLES = [
  'fyh_staff_schedules',
  'fyh_resources',
  'fyh_appointments',
  'fyh_appointment_services',
  'fyh_invoices',
  'fyh_invoice_lines',
  'fyh_invoice_payments',
  'fyh_credit_notes',
  'fyh_invoice_line_attributions',
  'fyh_commission_entries',
  'fyh_stock_movements',
  'fyh_stock_adjustments',
  'fyh_floor_issues',
  'fyh_product_batches',
  'fyh_purchase_orders',
  'fyh_purchase_order_lines',
  'fyh_goods_receipts',
  'fyh_goods_receipt_lines',
  'fyh_purchases',
  'fyh_purchase_lines',
  'fyh_purchase_returns',
  'fyh_purchase_return_lines',
  'fyh_purchase_audit_events',
  'fyh_expenses',
  'wf_schedules',
  'wf_attendance',
] as const;

async function main() {
  console.log('Hair Phase B preflight (read-only)');
  console.log('host:', getHairDatabaseHost() ?? 'unknown');
  console.log('FYH_SAAS_TENANT:', process.env.FYH_SAAS_TENANT ?? '(unset)');

  const { db, close } = createHairClient({ max: 1 });
  try {
    const journal = await db.execute<{ hash: string; created_at: string }>(
      sql.raw(
        `SELECT hash, created_at::text FROM drizzle_hair.__drizzle_migrations ORDER BY id`,
      ),
    );
    console.log('\nApplied Hair migration hashes:', journal.length);

    const idx0036 = await db.execute<{ exists: boolean }>(
      sql.raw(
        `SELECT EXISTS (
           SELECT 1 FROM pg_indexes WHERE indexname = 'fyh_invoices_org_number_uidx'
         ) AS exists`,
      ),
    );
    console.log('0036 org invoice unique present:', idx0036[0]?.exists);

    const sessionCol = await db.execute<{ exists: boolean }>(
      sql.raw(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'wf_auth_sessions' AND column_name = 'organization_id'
         ) AS exists`,
      ),
    );
    console.log('wf_auth_sessions.organization_id exists:', sessionCol[0]?.exists);

    console.log('\nTable\trows\torg_null\tloc_null');
    for (const table of ORG_TABLES) {
      const exists = await db.execute<{ exists: boolean }>(
        sql.raw(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}') AS exists`,
        ),
      );
      if (!exists[0]?.exists) {
        console.log(`${table}\tMISSING`);
        continue;
      }
      const hasOrg = await db.execute<{ exists: boolean }>(
        sql.raw(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name = '${table}' AND column_name = 'organization_id'
           ) AS exists`,
        ),
      );
      const hasLoc =
        LOCATION_TABLES.includes(table as (typeof LOCATION_TABLES)[number]) &&
        (
          await db.execute<{ exists: boolean }>(
            sql.raw(
              `SELECT EXISTS (
                 SELECT 1 FROM information_schema.columns
                 WHERE table_name = '${table}' AND column_name = 'location_id'
               ) AS exists`,
            ),
          )
        )[0]?.exists;

      const locExpr = hasLoc ? `count(*) FILTER (WHERE location_id IS NULL)` : 'NULL';
      const orgExpr = hasOrg[0]?.exists
        ? `count(*) FILTER (WHERE organization_id IS NULL)`
        : 'NULL';
      const rows = await db.execute<{ n: string; org_null: string | null; loc_null: string | null }>(
        sql.raw(
          `SELECT count(*)::text AS n, ${orgExpr}::text AS org_null, ${locExpr}::text AS loc_null FROM ${table}`,
        ),
      );
      const r = rows[0]!;
      console.log(`${table}\t${r.n}\t${r.org_null ?? 'n/a'}\t${r.loc_null ?? 'n/a'}`);
    }

    const distinctOrgs = await db.execute<{ organization_id: string }>(
      sql.raw(
        `SELECT DISTINCT organization_id::text AS organization_id FROM fyh_settings WHERE organization_id IS NOT NULL
         UNION
         SELECT DISTINCT organization_id::text FROM wf_employees WHERE organization_id IS NOT NULL
         UNION
         SELECT DISTINCT organization_id::text FROM fyh_invoices WHERE organization_id IS NOT NULL`,
      ),
    );
    console.log('\nDistinct org ids (settings/employees/invoices):', distinctOrgs.map((r) => r.organization_id));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
