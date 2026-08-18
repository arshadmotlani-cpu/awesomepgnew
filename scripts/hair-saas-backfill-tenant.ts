/* eslint-disable no-console */
/**
 * Phase 0B S5 — Idempotent batched Hair tenant backfill from bootstrap artifact.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { createHairClient } from '@/src/hair/db/client';

type BootstrapArtifact = {
  organizationId: string;
  locationId: string;
  invoicePrefix?: string;
  invoiceNextSeq?: number;
  customerCodeNextSeq?: number;
  userMap?: Record<string, string>;
};

function loadArtifact(): BootstrapArtifact {
  const path = resolve('staging-bootstrap-ids.json');
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as BootstrapArtifact;
  }
  const orgId = process.env.FYH_BOOTSTRAP_ORG_ID?.trim();
  const locId = process.env.FYH_BOOTSTRAP_LOC_ID?.trim();
  if (!orgId || !locId) {
    throw new Error('staging-bootstrap-ids.json missing and FYH_BOOTSTRAP_ORG_ID/LOC_ID not set');
  }
  return { organizationId: orgId, locationId: locId, userMap: {} };
}

const ORG_ONLY_TABLES = [
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
  'fyh_auth_sessions',
  'fyh_admin_users',
  'wf_engine_memberships',
  'wf_permission_grants',
  'wf_role_templates',
  'wf_payroll_runs',
  'wf_payroll_lines',
  'wf_incentive_plans',
  'wf_incentives',
  'wf_audit_log',
  'wf_events',
];

const ORG_LOC_TABLES = [
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
  'wf_employees',
];

async function backfillOrgTable(db: ReturnType<typeof createHairClient>['db'], table: string, orgId: string) {
  await db.execute(
    sql.raw(`UPDATE ${table} SET organization_id = '${orgId}' WHERE organization_id IS NULL`),
  );
}

async function backfillOrgLocTable(
  db: ReturnType<typeof createHairClient>['db'],
  table: string,
  orgId: string,
  locId: string,
) {
  await db.execute(
    sql.raw(
      `UPDATE ${table} SET organization_id = '${orgId}', location_id = '${locId}' WHERE organization_id IS NULL`,
    ),
  );
}

async function main() {
  const artifact = loadArtifact();
  const { organizationId: orgId, locationId: locId } = artifact;
  const { db, close } = createHairClient({ max: 1 });

  console.log(`Backfill org=${orgId} loc=${locId}`);

  for (const table of ORG_ONLY_TABLES) {
    console.log(`  B2 org → ${table}`);
    await backfillOrgTable(db, table, orgId);
  }

  for (const table of ORG_LOC_TABLES) {
    console.log(`  B2 org+loc → ${table}`);
    await backfillOrgLocTable(db, table, orgId, locId);
  }

  if (artifact.userMap) {
    for (const [key, userId] of Object.entries(artifact.userMap)) {
      if (key.startsWith('employee:')) {
        const empId = key.slice('employee:'.length);
        await db.execute(
          sql.raw(
            `UPDATE wf_employees SET user_id = '${userId}' WHERE id = '${empId}' AND user_id IS NULL`,
          ),
        );
      }
      if (key.startsWith('admin:')) {
        const adminId = key.slice('admin:'.length);
        await db.execute(
          sql.raw(
            `UPDATE fyh_admin_users SET user_id = '${userId}' WHERE id = '${adminId}' AND user_id IS NULL`,
          ),
        );
      }
    }
  }

  await db.execute(
    sql.raw(`
      INSERT INTO fyh_org_invoice_sequences (organization_id, prefix, next_seq)
      VALUES ('${orgId}', '${artifact.invoicePrefix ?? 'INV'}', ${artifact.invoiceNextSeq ?? 1})
      ON CONFLICT (organization_id) DO NOTHING
    `),
  );

  await db.execute(
    sql.raw(`
      INSERT INTO fyh_org_customer_sequences (organization_id, next_seq)
      VALUES ('${orgId}', ${artifact.customerCodeNextSeq ?? 1})
      ON CONFLICT (organization_id) DO NOTHING
    `),
  );

  await db.execute(
    sql.raw(`
      INSERT INTO fyh_staff_locations (staff_id, organization_id, location_id, is_primary)
      SELECT s.id, '${orgId}', '${locId}', true
      FROM fyh_staff s
      WHERE s.organization_id = '${orgId}'
      ON CONFLICT DO NOTHING
    `),
  );

  await db.execute(
    sql.raw(`
      INSERT INTO fyh_location_stock (organization_id, location_id, product_id, quantity)
      SELECT '${orgId}', '${locId}', p.id, COALESCE(p.stock_qty, 0)
      FROM fyh_products p
      WHERE p.organization_id = '${orgId}'
      ON CONFLICT DO NOTHING
    `),
  );

  await close();
  console.log('✓ Backfill complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
