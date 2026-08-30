/* eslint-disable no-console */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { createHairClient } from '@/src/hair/db/client';
import { sql } from 'drizzle-orm';
import {
  TEST_EXPENSE_TITLE_WHERE,
  TEST_MEMBERSHIP_PLAN_WHERE,
  TEST_PACKAGE_PLAN_WHERE,
  TEST_PURCHASE_EXPENSE_TITLE_WHERE,
  testBrandWhere,
  testCustomerWhere,
  testProductWhere,
  testPurchaseVendorJoinWhere,
  testServiceWhere,
  testVendorWhere,
} from '@/src/hair/lib/testArtifactPatterns';

loadAppEnv();

async function count(db: ReturnType<typeof createHairClient>['db'], label: string, whereSql: string) {
  const result = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM ${whereSql}`));
  const row = Array.isArray(result) ? result[0] : (result as { rows: Array<{ c: number }> }).rows?.[0];
  return { label, count: Number(row?.c ?? 0) };
}

async function main() {
  const url = process.env.HAIR_DATABASE_URL || process.env.HAIR_DATABASE_DATABASE_URL || '';
  console.log('DB host:', url.match(/@([^/]+)/)?.[1] ?? 'unknown');

  const { db, close } = createHairClient({ max: 1 });
  try {
    const rows = await Promise.all([
      count(db, 'ALL customers', 'fyh_customers'),
      count(db, 'test customers', `fyh_customers WHERE ${testCustomerWhere()}`),
      count(db, 'ALL invoices', 'fyh_invoices'),
      count(db, 'invoices (test customers)', `fyh_invoices i INNER JOIN fyh_customers c ON c.id = i.customer_id WHERE ${testCustomerWhere('c')}`),
      count(db, 'ALL products', 'fyh_products'),
      count(db, 'test products', `fyh_products WHERE ${testProductWhere()}`),
      count(db, 'ALL services', 'fyh_services'),
      count(db, 'test services', `fyh_services WHERE ${testServiceWhere()}`),
      count(db, 'ALL vendors', 'fyh_vendors'),
      count(db, 'test vendors', `fyh_vendors WHERE ${testVendorWhere()}`),
      count(db, 'ALL purchases', 'fyh_purchases'),
      count(db, 'purchases (test vendors)', `fyh_purchases pur INNER JOIN fyh_vendors v ON v.id = pur.vendor_id WHERE ${testPurchaseVendorJoinWhere('v')}`),
      count(db, 'ALL purchase lines', 'fyh_purchase_lines'),
      count(db, 'ALL expenses', 'fyh_expenses'),
      count(db, 'test expenses (title)', `fyh_expenses WHERE ${TEST_EXPENSE_TITLE_WHERE} OR ${TEST_PURCHASE_EXPENSE_TITLE_WHERE}`),
      count(db, 'expenses (test vendor purchases)', `fyh_expenses e INNER JOIN fyh_purchases pur ON pur.id = e.purchase_id INNER JOIN fyh_vendors v ON v.id = pur.vendor_id WHERE ${testVendorWhere('v')}`),
      count(db, 'ALL appointments', 'fyh_appointments'),
      count(db, 'ALL membership plans', 'fyh_membership_plans'),
      count(db, 'RC membership plans', `fyh_membership_plans WHERE ${TEST_MEMBERSHIP_PLAN_WHERE}`),
      count(db, 'ALL package plans', 'fyh_package_plans'),
      count(db, 'RC package plans', `fyh_package_plans WHERE ${TEST_PACKAGE_PLAN_WHERE}`),
      count(db, 'test brands', `fyh_brands WHERE name <> 'Unbranded' AND ${testBrandWhere()}`),
    ]);

    console.log('\n=== Production Hair ERP audit ===');
    for (const row of rows) {
      console.log(`${row.label.padEnd(42)} ${row.count}`);
    }

    const samples = await db.execute(sql.raw(`
      SELECT pur.purchase_number, v.name AS vendor_name, pur.purchase_date::text, pur.total_paise
      FROM fyh_purchases pur
      INNER JOIN fyh_vendors v ON v.id = pur.vendor_id
      WHERE v.name LIKE 'VB Stmt %' OR v.name LIKE 'VB Reverse %' OR v.name LIKE 'VB Edit %'
      ORDER BY pur.created_at DESC
      LIMIT 10
    `));
    const sampleList = Array.isArray(samples) ? samples : (samples as { rows: unknown[] }).rows;
    console.log('\n=== Sample VB Stmt/Reverse/Edit purchases ===');
    for (const r of sampleList) console.log(JSON.stringify(r));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
