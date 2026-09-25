/**
 * Reset all FYH salon employee permission overrides to their access-role template.
 * Safe, idempotent, org-scoped when FYH_ORG_ID is set.
 *
 * Usage: npx tsx scripts/fyh-reset-workforce-grants-to-role-template.ts
 */
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import { resetEmployeePermissionsToRoleTemplate } from '@/src/workforce/services/employees';

async function main() {
  const orgId = process.env.FYH_ORG_ID?.trim();
  const rows = await hairDb
    .select({ employeeId: wfEngineMemberships.employeeId })
    .from(wfEngineMemberships)
    .innerJoin(wfEmployees, eq(wfEmployees.id, wfEngineMemberships.employeeId))
    .where(eq(wfEngineMemberships.engineId, 'fyh_salon'));

  let reset = 0;
  for (const row of rows) {
    if (orgId) {
      const [emp] = await hairDb
        .select({ organizationId: wfEmployees.organizationId })
        .from(wfEmployees)
        .where(eq(wfEmployees.id, row.employeeId))
        .limit(1);
      if (emp?.organizationId !== orgId) continue;
    }
    await resetEmployeePermissionsToRoleTemplate(row.employeeId, 'fyh_salon', null);
    reset += 1;
  }
  console.log(`Reset ${reset} employee grant row(s) to role templates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
