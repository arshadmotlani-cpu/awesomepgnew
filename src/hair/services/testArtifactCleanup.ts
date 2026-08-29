import { sql } from 'drizzle-orm';
import type { createHairClient } from '@/src/hair/db/client';
import {
  TEST_APPOINTMENT_START_WHERE,
  TEST_EXPENSE_TITLE_WHERE,
  TEST_MEMBERSHIP_PLAN_WHERE,
  TEST_PACKAGE_PLAN_WHERE,
  testBrandWhere,
  testCustomerWhere,
  testProductWhere,
  testServiceWhere,
  testVendorWhere,
} from '@/src/hair/lib/testArtifactPatterns';

export type TestArtifactAuditRow = { label: string; count: number };

export type TestArtifactCleanupResult = {
  auditBefore: TestArtifactAuditRow[];
  deleted: TestArtifactAuditRow[];
  auditAfter: TestArtifactAuditRow[];
};

type HairDb = ReturnType<typeof createHairClient>['db'];

function countRows(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const rows = (result as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? rows.length : 0;
}

async function auditCounts(db: HairDb): Promise<TestArtifactAuditRow[]> {
  const queries: Array<{ label: string; sql: string }> = [
    {
      label: 'test customers',
      sql: `SELECT count(*)::int AS c FROM fyh_customers WHERE ${testCustomerWhere()}`,
    },
    {
      label: 'test appointments (2099+)',
      sql: `SELECT count(*)::int AS c FROM fyh_appointments WHERE ${TEST_APPOINTMENT_START_WHERE}`,
    },
    {
      label: 'invoices for test customers',
      sql: `SELECT count(*)::int AS c FROM fyh_invoices i
        INNER JOIN fyh_customers c ON c.id = i.customer_id
        WHERE ${testCustomerWhere('c')}`,
    },
    {
      label: 'test products',
      sql: `SELECT count(*)::int AS c FROM fyh_products WHERE ${testProductWhere()}`,
    },
    {
      label: 'test services',
      sql: `SELECT count(*)::int AS c FROM fyh_services WHERE ${testServiceWhere()}`,
    },
    {
      label: 'test vendors',
      sql: `SELECT count(*)::int AS c FROM fyh_vendors WHERE ${testVendorWhere()}`,
    },
    {
      label: 'test expenses',
      sql: `SELECT count(*)::int AS c FROM fyh_expenses WHERE ${TEST_EXPENSE_TITLE_WHERE}`,
    },
    {
      label: 'RC membership plans',
      sql: `SELECT count(*)::int AS c FROM fyh_membership_plans WHERE ${TEST_MEMBERSHIP_PLAN_WHERE}`,
    },
    {
      label: 'RC package plans',
      sql: `SELECT count(*)::int AS c FROM fyh_package_plans WHERE ${TEST_PACKAGE_PLAN_WHERE}`,
    },
  ];

  const out: TestArtifactAuditRow[] = [];
  for (const q of queries) {
    const result = await db.execute(sql.raw(q.sql));
    const row = Array.isArray(result) ? result[0] : (result as { rows?: Array<{ c: number }> }).rows?.[0];
    out.push({ label: q.label, count: Number(row?.c ?? 0) });
  }
  return out;
}

/**
 * Delete integration-test artifacts in dependency-safe order.
 * Does not touch legitimate catalog rows (e.g. Unbranded brand) or user-entered data.
 */
export async function cleanupHairIntegrationTestArtifacts(
  db: HairDb,
  { dryRun = true }: { dryRun?: boolean } = {},
): Promise<TestArtifactCleanupResult> {
  const auditBefore = await auditCounts(db);
  const deleted: TestArtifactAuditRow[] = [];

  const steps: Array<{ label: string; sql: string }> = [
    {
      label: 'commission entries (test invoices)',
      sql: `DELETE FROM fyh_commission_entries ce
        USING fyh_invoice_lines il, fyh_invoices i, fyh_customers c
        WHERE ce.invoice_line_id = il.id AND il.invoice_id = i.id AND i.customer_id = c.id
          AND ${testCustomerWhere('c')}
        RETURNING ce.id`,
    },
    {
      label: 'invoice line attributions (test invoices)',
      sql: `DELETE FROM fyh_invoice_line_attributions a
        USING fyh_invoice_lines il, fyh_invoices i, fyh_customers c
        WHERE a.invoice_line_id = il.id AND il.invoice_id = i.id AND i.customer_id = c.id
          AND ${testCustomerWhere('c')}
        RETURNING a.id`,
    },
    {
      label: 'invoice payments (test invoices)',
      sql: `DELETE FROM fyh_invoice_payments p
        USING fyh_invoices i, fyh_customers c
        WHERE p.invoice_id = i.id AND i.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING p.id`,
    },
    {
      label: 'invoice lines (test invoices)',
      sql: `DELETE FROM fyh_invoice_lines il
        USING fyh_invoices i, fyh_customers c
        WHERE il.invoice_id = i.id AND i.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING il.id`,
    },
    {
      label: 'invoices (test customers)',
      sql: `DELETE FROM fyh_invoices i
        USING fyh_customers c
        WHERE i.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING i.id`,
    },
    {
      label: 'credit notes (test customers)',
      sql: `DELETE FROM fyh_credit_notes cn
        USING fyh_customers c
        WHERE cn.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING cn.id`,
    },
    {
      label: 'financial ledger (test customers)',
      sql: `DELETE FROM fyh_financial_ledger fl
        USING fyh_customers c
        WHERE fl.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING fl.id`,
    },
    {
      label: 'appointment services (test customers)',
      sql: `DELETE FROM fyh_appointment_services s
        USING fyh_appointments a, fyh_customers c
        WHERE s.appointment_id = a.id AND a.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING s.id`,
    },
    {
      label: 'appointments (test customers)',
      sql: `DELETE FROM fyh_appointments a
        USING fyh_customers c
        WHERE a.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING a.id`,
    },
    {
      label: 'customer memberships (test customers)',
      sql: `DELETE FROM fyh_customer_memberships m
        USING fyh_customers c
        WHERE m.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING m.id`,
    },
    {
      label: 'customer packages (test customers)',
      sql: `DELETE FROM fyh_customer_packages p
        USING fyh_customers c
        WHERE p.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING p.id`,
    },
    {
      label: 'bridal events (test customers)',
      sql: `DELETE FROM fyh_bridal_events e
        USING fyh_bridal_profiles p, fyh_customers c
        WHERE e.bridal_profile_id = p.id AND p.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING e.id`,
    },
    {
      label: 'bridal profiles (test customers)',
      sql: `DELETE FROM fyh_bridal_profiles p
        USING fyh_customers c
        WHERE p.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING p.id`,
    },
    {
      label: 'customer timeline (test customers)',
      sql: `DELETE FROM fyh_customer_timeline t
        USING fyh_customers c
        WHERE t.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING t.id`,
    },
    {
      label: 'customer notes (test customers)',
      sql: `DELETE FROM fyh_customer_notes n
        USING fyh_customers c
        WHERE n.customer_id = c.id AND ${testCustomerWhere('c')}
        RETURNING n.id`,
    },
    {
      label: 'customers (integration test)',
      sql: `DELETE FROM fyh_customers WHERE ${testCustomerWhere()} RETURNING id`,
    },
    {
      label: 'test expenses',
      sql: `DELETE FROM fyh_expenses WHERE ${TEST_EXPENSE_TITLE_WHERE} RETURNING id`,
    },
    {
      label: 'stock movements (test products)',
      sql: `DELETE FROM fyh_stock_movements m
        USING fyh_products p
        WHERE m.product_id = p.id AND ${testProductWhere('p')}
        RETURNING m.id`,
    },
    {
      label: 'goods receipt lines (test products)',
      sql: `DELETE FROM fyh_goods_receipt_lines gl
        USING fyh_products p
        WHERE gl.product_id = p.id AND ${testProductWhere('p')}
        RETURNING gl.id`,
    },
    {
      label: 'purchase order lines (test products)',
      sql: `DELETE FROM fyh_purchase_order_lines pol
        USING fyh_products p
        WHERE pol.product_id = p.id AND ${testProductWhere('p')}
        RETURNING pol.id`,
    },
    {
      label: 'purchase lines (test products)',
      sql: `DELETE FROM fyh_purchase_lines pl
        USING fyh_products p
        WHERE pl.product_id = p.id AND ${testProductWhere('p')}
        RETURNING pl.id`,
    },
    {
      label: 'stock adjustments (test products)',
      sql: `DELETE FROM fyh_stock_adjustments sa
        USING fyh_products p
        WHERE sa.product_id = p.id AND ${testProductWhere('p')}
        RETURNING sa.id`,
    },
    {
      label: 'product batches (test products)',
      sql: `DELETE FROM fyh_product_batches pb
        USING fyh_products p
        WHERE pb.product_id = p.id AND ${testProductWhere('p')}
        RETURNING pb.id`,
    },
    {
      label: 'floor issues (test products)',
      sql: `DELETE FROM fyh_floor_issues fi
        USING fyh_products p
        WHERE fi.product_id = p.id AND ${testProductWhere('p')}
        RETURNING fi.id`,
    },
    {
      label: 'purchase return lines (test products)',
      sql: `DELETE FROM fyh_purchase_return_lines prl
        USING fyh_products p
        WHERE prl.product_id = p.id AND ${testProductWhere('p')}
        RETURNING prl.id`,
    },
    {
      label: 'location stock (test products)',
      sql: `DELETE FROM fyh_location_stock ls
        USING fyh_products p
        WHERE ls.product_id = p.id AND ${testProductWhere('p')}
        RETURNING ls.id`,
    },
    {
      label: 'service consumables (test products)',
      sql: `DELETE FROM fyh_service_consumables sc
        USING fyh_products p
        WHERE sc.product_id = p.id AND ${testProductWhere('p')}
        RETURNING sc.service_id`,
    },
    {
      label: 'test products',
      sql: `DELETE FROM fyh_products WHERE ${testProductWhere()} RETURNING id`,
    },
    {
      label: 'test brands (not Unbranded)',
      sql: `DELETE FROM fyh_brands WHERE name <> 'Unbranded' AND ${testBrandWhere()} RETURNING id`,
    },
    {
      label: 'service consumables (test services)',
      sql: `DELETE FROM fyh_service_consumables sc
        USING fyh_services s
        WHERE sc.service_id = s.id AND ${testServiceWhere('s')}
        RETURNING sc.service_id`,
    },
    {
      label: 'service staff links (test services)',
      sql: `DELETE FROM fyh_service_staff ss
        USING fyh_services s
        WHERE ss.service_id = s.id AND ${testServiceWhere('s')}
        RETURNING ss.service_id`,
    },
    {
      label: 'test services',
      sql: `DELETE FROM fyh_services WHERE ${testServiceWhere()} RETURNING id`,
    },
    {
      label: 'RC membership plans',
      sql: `DELETE FROM fyh_membership_plans WHERE ${TEST_MEMBERSHIP_PLAN_WHERE} RETURNING id`,
    },
    {
      label: 'RC package plans',
      sql: `DELETE FROM fyh_package_plans WHERE ${TEST_PACKAGE_PLAN_WHERE} RETURNING id`,
    },
    {
      label: 'vendor payment allocations (test vendors)',
      sql: `DELETE FROM fyh_vendor_payment_allocations a
        USING fyh_vendor_payments p, fyh_vendors v
        WHERE a.payment_id = p.id AND p.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING a.id`,
    },
    {
      label: 'vendor payments (test vendors)',
      sql: `DELETE FROM fyh_vendor_payments p
        USING fyh_vendors v
        WHERE p.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING p.id`,
    },
    {
      label: 'vendor payables (test vendors)',
      sql: `DELETE FROM fyh_vendor_payables pay
        USING fyh_vendors v
        WHERE pay.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING pay.id`,
    },
    {
      label: 'purchase audit events (test vendors)',
      sql: `DELETE FROM fyh_purchase_audit_events e
        USING fyh_purchases pur, fyh_vendors v
        WHERE e.purchase_id = pur.id AND pur.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING e.id`,
    },
    {
      label: 'purchase lines (test vendor purchases)',
      sql: `DELETE FROM fyh_purchase_lines pl
        USING fyh_purchases pur, fyh_vendors v
        WHERE pl.purchase_id = pur.id AND pur.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING pl.id`,
    },
    {
      label: 'purchases (test vendors)',
      sql: `DELETE FROM fyh_purchases pur
        USING fyh_vendors v
        WHERE pur.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING pur.id`,
    },
    {
      label: 'goods receipt lines (test vendors)',
      sql: `DELETE FROM fyh_goods_receipt_lines gl
        USING fyh_goods_receipts gr, fyh_vendors v
        WHERE gl.goods_receipt_id = gr.id AND gr.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING gl.id`,
    },
    {
      label: 'goods receipts (test vendors)',
      sql: `DELETE FROM fyh_goods_receipts gr
        USING fyh_vendors v
        WHERE gr.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING gr.id`,
    },
    {
      label: 'purchase order lines (test vendors)',
      sql: `DELETE FROM fyh_purchase_order_lines pol
        USING fyh_purchase_orders po, fyh_vendors v
        WHERE pol.purchase_order_id = po.id AND po.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING pol.id`,
    },
    {
      label: 'purchase orders (test vendors)',
      sql: `DELETE FROM fyh_purchase_orders po
        USING fyh_vendors v
        WHERE po.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING po.id`,
    },
    {
      label: 'vendor notes (test vendors)',
      sql: `DELETE FROM fyh_vendor_notes n
        USING fyh_vendors v
        WHERE n.vendor_id = v.id AND ${testVendorWhere('v')}
        RETURNING n.id`,
    },
    {
      label: 'test vendors',
      sql: `DELETE FROM fyh_vendors WHERE ${testVendorWhere()} RETURNING id`,
    },
    {
      label: 'tenant test settings',
      sql: `DELETE FROM fyh_settings
        WHERE business_name IN ('Tenant A Salon', 'Tenant B Salon', 'Hostile A Salon')
        RETURNING id`,
    },
  ];

  for (const step of steps) {
    if (dryRun) {
      deleted.push({ label: step.label, count: 0 });
      continue;
    }
    const result = await db.execute(sql.raw(step.sql));
    deleted.push({ label: step.label, count: countRows(result) });
  }

  const auditAfter = dryRun ? auditBefore : await auditCounts(db);
  return { auditBefore, deleted, auditAfter };
}
