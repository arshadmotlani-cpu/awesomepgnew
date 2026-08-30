/**
 * Identifiers for Hair integration-test / demo rows that must not appear in production salons.
 * Used by cleanup scripts and audits — not for hiding data in normal UI queries.
 */

export function testCustomerWhere(alias = ''): string {
  const col = alias ? `${alias}.full_name` : 'full_name';
  return `(${col} LIKE 'RC Customer %' OR ${col} LIKE 'Tenant %' OR ${col} LIKE 'Hostile %')`;
}

export function testProductWhere(alias = ''): string {
  const col = alias ? `${alias}.name` : 'name';
  return `(${col} LIKE 'Inv Ops %' OR ${col} LIKE 'VB Product %' OR ${col} LIKE 'Purchase Brain Product %' OR ${col} LIKE 'Vendor Ledger Product %' OR ${col} = 'RC Salon Shampoo')`;
}

export function testBrandWhere(alias = ''): string {
  const col = alias ? `${alias}.name` : 'name';
  return `(${col} LIKE 'Inv Ops Brand %' OR ${col} LIKE 'VB Brand %' OR ${col} LIKE 'Purchase Brain Brand %' OR ${col} LIKE 'Vendor Ledger Brand %')`;
}

export function testVendorWhere(alias = ''): string {
  const col = alias ? `${alias}.name` : 'name';
  return `(
    ${col} LIKE 'RC Vendor %'
    OR ${col} LIKE 'PB Vendor%'
    OR ${col} LIKE 'VB %'
    OR ${col} LIKE 'VL %'
  )`;
}

/** Purchases tied to integration-test vendors. */
export function testPurchaseVendorJoinWhere(vendorAlias = 'v'): string {
  return testVendorWhere(vendorAlias);
}

export function testServiceWhere(alias = ''): string {
  const code = alias ? `${alias}.code` : 'code';
  const name = alias ? `${alias}.name` : 'name';
  return `(${code} LIKE 'RC-%' OR ${name} ILIKE 'RC %' OR ${name} ~* '(^|[[:space:]])uat($|[[:space:]])' OR ${name} ~* '(^|[[:space:]])test($|[[:space:]])' OR ${name} ~* '(^|[[:space:]])demo($|[[:space:]])')`;
}

export const TEST_MEMBERSHIP_PLAN_WHERE = `name LIKE 'RC %'`;
export const TEST_PACKAGE_PLAN_WHERE = `name LIKE 'RC %'`;
export const TEST_EXPENSE_TITLE_WHERE = `title LIKE 'Quick action expense %'`;

/** Orphaned inventory purchase expenses left after test purchase rows were removed. */
export const TEST_PURCHASE_EXPENSE_TITLE_WHERE = `(
  title LIKE 'Purchase PUR-% — PB Vendor%'
  OR title LIKE 'Purchase PUR-% — VB %'
  OR title LIKE 'Purchase PUR-% — VL %'
  OR title LIKE 'Purchase PUR-% — RC Vendor %'
)`;
export const TEST_APPOINTMENT_START_WHERE = `start_at >= '2099-01-01'::timestamptz`;
