import { sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { assertHairIntegrationTestWritesAllowed } from '@/src/hair/lib/db/integrationWriteGuard';

export type HairMigrationProbe = {
  ok: boolean;
  missing: string[];
  hint: string;
};

const MIGRATE_CMD = 'npm run hair:db:migrate';

/** Probes columns/tables required for Quick Sale + attribution integration tests. */
export async function probeHairQuickSaleMigrations(): Promise<HairMigrationProbe> {
  assertHairIntegrationTestWritesAllowed();
  const missing: string[] = [];
  const checks: Array<{ label: string; query: ReturnType<typeof sql> }> = [
    { label: '0012 fyh_invoices.source', query: sql`SELECT source FROM fyh_invoices LIMIT 0` },
    { label: '0013 fyh_invoice_line_attributions', query: sql`SELECT id FROM fyh_invoice_line_attributions LIMIT 0` },
    { label: '0014 fyh_invoices.pos_draft', query: sql`SELECT pos_draft FROM fyh_invoices LIMIT 0` },
    { label: '0016 fyh_financial_ledger', query: sql`SELECT id FROM fyh_financial_ledger LIMIT 0` },
    { label: '0017 fyh_vendors', query: sql`SELECT id FROM fyh_vendors LIMIT 0` },
    { label: '0017 inventory_settings', query: sql`SELECT inventory_settings FROM fyh_settings LIMIT 0` },
    { label: '0018 billing_settings', query: sql`SELECT billing_settings FROM fyh_settings LIMIT 0` },
    { label: '0019 fyh_admin_users.permissions', query: sql`SELECT permissions FROM fyh_admin_users LIMIT 0` },
    { label: '0021 fyh_historical_import_batches', query: sql`SELECT id FROM fyh_historical_import_batches LIMIT 0` },
    { label: '0021 fyh_invoices.import_row_key', query: sql`SELECT import_row_key FROM fyh_invoices LIMIT 0` },
    { label: '0022 wf_employees', query: sql`SELECT id FROM wf_employees LIMIT 0` },
    { label: '0034 fyh_customers.organization_id', query: sql`SELECT organization_id FROM fyh_customers LIMIT 0` },
    { label: '0035 fyh_org_invoice_sequences', query: sql`SELECT organization_id FROM fyh_org_invoice_sequences LIMIT 0` },
  ];
  for (const c of checks) {
    try {
      await hairDb.execute(c.query);
    } catch {
      missing.push(c.label);
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    hint:
      missing.length > 0
        ? `Hair DB is missing migrations (${missing.join(', ')}). Run: ${MIGRATE_CMD}`
        : '',
  };
}

export function migrationSkipMessage(probe: HairMigrationProbe): string {
  return probe.hint || `Hair migrations not applied. Run: ${MIGRATE_CMD}`;
}
