/* eslint-disable no-console */
/**
 * Read-only production Hair preflight for SaaS bootstrap sizing.
 * Targets production Hair ONLY (ep-billowing-bar). No writes.
 */
import { sql } from 'drizzle-orm';
import { requireProductionHairReadOnlyEnv } from '@/src/lib/db/loadProductionCutoverEnv';
import { resolvePlatformAccessRoleFromWorkforce } from '@/src/platform/lib/bootstrapAccessRole';

requireProductionHairReadOnlyEnv();

import { createHairClient } from '@/src/hair/db/client';
import {
  PRODUCTION_HAIR_HOST_FRAGMENT,
  getResolvedProductionHairHost,
} from '@/src/lib/db/loadProductionCutoverEnv';

type CountRow = { c: number | string };

function num(row: CountRow | undefined): number {
  return Number(row?.c ?? 0);
}

async function main() {
  const hairHost = getResolvedProductionHairHost();
  console.log('Production Hair read-only preflight\n');
  console.log(`Hair host: ${hairHost}`);
  console.log(`Expected production fragment: ${PRODUCTION_HAIR_HOST_FRAGMENT}\n`);

  const { db, close } = createHairClient({ max: 1 });
  const issues: string[] = [];

  const schemaChecks = [
    {
      label: 'fyh_customers.organization_id column',
      sql: `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'fyh_customers' AND column_name = 'organization_id'
      ) AS c`,
      expect: (v: number) => v === 1,
    },
    {
      label: 'fyh_org_invoice_sequences table',
      sql: `SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'fyh_org_invoice_sequences'`,
      expect: (v: number) => v >= 1,
    },
  ];

  for (const check of schemaChecks) {
    const rows = await db.execute<CountRow>(sql.raw(check.sql));
    const row = Array.isArray(rows) ? rows[0] : rows;
    const value = num(row as CountRow);
    const ok = check.expect(value);
    console.log(`${ok ? '✓' : '✗'} ${check.label}: ${value}`);
    if (!ok) issues.push(`Schema: ${check.label}`);
  }

  const counts = await db.execute<{
    customers: number;
    invoices: number;
    appointments: number;
    active_login_employees: number;
    wf_employees: number;
    fyh_staff: number;
    legacy_admins: number;
    invoice_grand_total_paise: number;
    expense_paise: number;
    customers_with_org: number;
    invoices_with_org: number;
  }>(sql.raw(`
    SELECT
      (SELECT COUNT(*)::int FROM fyh_customers) AS customers,
      (SELECT COUNT(*)::int FROM fyh_invoices) AS invoices,
      (SELECT COUNT(*)::int FROM fyh_appointments) AS appointments,
      (SELECT COUNT(*)::int FROM wf_employees WHERE can_login = true AND status = 'active') AS active_login_employees,
      (SELECT COUNT(*)::int FROM wf_employees) AS wf_employees,
      (SELECT COUNT(*)::int FROM fyh_staff) AS fyh_staff,
      (SELECT COUNT(*)::int FROM fyh_admin_users) AS legacy_admins,
      (SELECT COALESCE(SUM(grand_total_paise), 0)::bigint FROM fyh_invoices) AS invoice_grand_total_paise,
      (SELECT COALESCE(SUM(amount_paise), 0)::bigint FROM fyh_expenses) AS expense_paise,
      (SELECT COUNT(*)::int FROM fyh_customers WHERE organization_id IS NOT NULL) AS customers_with_org,
      (SELECT COUNT(*)::int FROM fyh_invoices WHERE organization_id IS NOT NULL) AS invoices_with_org
  `));

  const c = (Array.isArray(counts) ? counts[0] : counts) as Record<string, number>;

  console.log('\nRow counts (production Hair):');
  console.log(`  customers: ${c.customers}`);
  console.log(`  invoices: ${c.invoices}`);
  console.log(`  appointments: ${c.appointments}`);
  console.log(`  wf_employees (all): ${c.wf_employees}`);
  console.log(`  wf_employees (active login): ${c.active_login_employees}`);
  console.log(`  fyh_staff: ${c.fyh_staff}`);
  console.log(`  fyh_admin_users (legacy): ${c.legacy_admins}`);

  console.log('\nFinancial checksums (baseline for post-bootstrap verify):');
  console.log(`  invoice SUM(grand_total_paise): ${c.invoice_grand_total_paise}`);
  console.log(`  expense SUM(amount_paise): ${c.expense_paise}`);

  const settingsCountRows = await db.execute<CountRow>(
    sql`SELECT COUNT(*)::int AS c FROM fyh_settings`,
  );
  const settingsCount = num(
    (Array.isArray(settingsCountRows) ? settingsCountRows[0] : settingsCountRows) as CountRow,
  );

  const canonicalSettingsRows = await db.execute<{
    id: string;
    business_name: string | null;
    organization_id: string | null;
  }>(sql.raw(`
    SELECT id, business_name, organization_id
    FROM fyh_settings
    WHERE organization_id IS NULL
    ORDER BY id
  `));
  const canonicalSettings = Array.isArray(canonicalSettingsRows)
    ? canonicalSettingsRows
    : [canonicalSettingsRows];

  const testSettingsRows = await db.execute<CountRow>(sql.raw(`
    SELECT COUNT(*)::int AS c FROM fyh_settings WHERE organization_id IS NOT NULL
  `));
  const testSettingsCount = num(
    (Array.isArray(testSettingsRows) ? testSettingsRows[0] : testSettingsRows) as CountRow,
  );

  if (canonicalSettings.length !== 1) {
    issues.push(
      `Canonical fyh_settings rows (organization_id IS NULL): ${canonicalSettings.length} (expected 1)`,
    );
    console.log(`\n✗ Canonical fyh_settings rows: ${canonicalSettings.length} (expected 1)`);
  } else {
    const row = canonicalSettings[0]!;
    console.log(
      `\n✓ Canonical fyh_settings: "${row.business_name ?? '(null)'}" id=${row.id}`,
    );
  }

  console.log(`  fyh_settings total rows: ${settingsCount}`);
  if (testSettingsCount > 0) {
    console.log(
      `  ⚠ fyh_settings test-artifact rows (organization_id set): ${testSettingsCount}`,
    );
  }

  const testCustomerOrgRows = await db.execute<CountRow>(sql.raw(`
    SELECT COUNT(*)::int AS c FROM fyh_customers WHERE organization_id IS NOT NULL
  `));
  const testCustomerOrgs = num(
    (Array.isArray(testCustomerOrgRows) ? testCustomerOrgRows[0] : testCustomerOrgRows) as CountRow,
  );
  if (testCustomerOrgs > 0) {
    console.log(
      `\n⚠ ${testCustomerOrgs} customer row(s) already have organization_id (likely integration-test artifacts — not production bootstrap)`,
    );
    if (testCustomerOrgs > 100) {
      issues.push(`${testCustomerOrgs} customers already have organization_id`);
    }
  } else {
    console.log('\n✓ No organization_id backfill on customers yet');
  }

  const rolePreview = await db.execute<{
    email: string;
    rank: string;
    job_role: string;
    is_system_provider: boolean;
    legacy_admin_role: string | null;
  }>(sql.raw(`
    SELECT DISTINCT ON (e.email)
      e.email,
      COALESCE(m.rank, 'team_member') AS rank,
      COALESCE(m.job_role, 'staff') AS job_role,
      COALESCE(e.is_system_provider, false) AS is_system_provider,
      a.role AS legacy_admin_role
    FROM wf_employees e
    LEFT JOIN wf_engine_memberships m
      ON m.employee_id = e.id AND m.engine_id = 'fyh_salon' AND m.is_active = true
    LEFT JOIN fyh_admin_users a ON lower(a.email) = lower(e.email)
    WHERE e.can_login = true AND e.status = 'active' AND e.email IS NOT NULL
    ORDER BY e.email, m.rank DESC NULLS LAST
  `));

  const roleRows = Array.isArray(rolePreview) ? rolePreview : [rolePreview];
  const accessRoleCounts: Record<string, number> = {};
  for (const row of roleRows) {
    const accessRole = resolvePlatformAccessRoleFromWorkforce({
      rank: row.rank,
      jobRole: row.job_role,
      isSystemProvider: Boolean(row.is_system_provider),
      legacyAdminRole: row.legacy_admin_role,
    });
    accessRoleCounts[accessRole] = (accessRoleCounts[accessRole] ?? 0) + 1;
  }

  const distinctEmails = new Set(
    roleRows.map((r) => String(r.email).trim().toLowerCase()).filter(Boolean),
  );

  console.log('\nBootstrap sizing (would be created on Platform):');
  console.log('  organizations: 1');
  console.log('  locations: 1 (Primary / Main Salon)');
  console.log(`  platform users (distinct login emails): ${distinctEmails.size}`);
  console.log(`  org memberships (active login employees): ${roleRows.length}`);
  console.log('  access_role distribution (from wf_engine_memberships):');
  for (const [role, count] of Object.entries(accessRoleCounts).sort()) {
    console.log(`    ${role}: ${count}`);
  }

  const employeesMissingEngine = await db.execute<CountRow>(sql.raw(`
    SELECT COUNT(*)::int AS c
    FROM wf_employees e
    WHERE e.can_login = true AND e.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM wf_engine_memberships m
        WHERE m.employee_id = e.id AND m.engine_id = 'fyh_salon' AND m.is_active = true
      )
  `));
  const missingEngine = num((Array.isArray(employeesMissingEngine) ? employeesMissingEngine[0] : employeesMissingEngine) as CountRow);
  if (missingEngine > 0) {
    issues.push(`${missingEngine} active login employee(s) missing fyh_salon engine membership`);
    console.log(`\n✗ ${missingEngine} login employee(s) without fyh_salon engine membership`);
  } else {
    console.log('\n✓ All active login employees have fyh_salon engine membership');
  }

  const duplicateEmails = await db.execute<{ email: string; c: number }>(sql.raw(`
    SELECT lower(email) AS email, COUNT(*)::int AS c
    FROM wf_employees
    WHERE email IS NOT NULL AND can_login = true AND status = 'active'
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  `));
  const dupRows = Array.isArray(duplicateEmails) ? duplicateEmails : [duplicateEmails];
  if (dupRows.length > 0 && dupRows[0]?.email) {
    issues.push(`${dupRows.length} duplicate login email group(s) among wf_employees`);
    console.log(`\n✗ Duplicate login emails among wf_employees: ${dupRows.length} group(s)`);
  } else {
    console.log('\n✓ No duplicate login emails among active wf_employees');
  }

  await close();

  console.log('\n--- Summary ---');
  if (issues.length === 0) {
    console.log('✓ Production Hair read-only preflight PASSED — bootstrap sizing looks consistent');
    console.log('  No mutations performed.');
    return;
  }

  console.error(`✗ ${issues.length} issue(s) found:`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
