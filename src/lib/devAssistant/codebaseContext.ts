import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_FILES = 6;
const MAX_CHARS = 4000;

/** Map admin routes to likely source files for read-only codebase context. */
const ROUTE_FILES: Array<{ pattern: RegExp; files: string[]; reason: string }> = [
  {
    pattern: /\/admin\/deposits/,
    files: [
      'src/services/deposits.ts',
      'src/services/depositCollection.ts',
      'app/(admin)/admin/deposits/page.tsx',
      'src/db/queries/admin.ts',
    ],
    reason: 'Deposit billing & ledger',
  },
  {
    pattern: /\/admin\/rent|\/admin\/collections|\/admin\/invoices/,
    files: [
      'src/services/rentInvoices.ts',
      'src/services/unifiedInvoices.ts',
      'src/lib/billing/financialMetrics.ts',
      'src/db/queries/admin.ts',
    ],
    reason: 'Rent & invoice billing',
  },
  {
    pattern: /\/admin\/operations|\/admin\/beds|\/admin\/occupancy/,
    files: [
      'src/services/operationsCenter.ts',
      'src/services/bookingLifecycle.ts',
      'src/db/schema/beds.ts',
      'src/db/schema/bedReservations.ts',
    ],
    reason: 'Bed assignment & occupancy',
  },
  {
    pattern: /\/admin\/residents/,
    files: ['src/services/residentAdmin.ts', 'app/(admin)/admin/residents/page.tsx'],
    reason: 'Resident admin',
  },
  {
    pattern: /\/admin\/overview|\/admin\/revenue/,
    files: [
      'src/services/overviewData.ts',
      'src/services/revenueCommandCenter.ts',
      'src/services/controlBoard.ts',
    ],
    reason: 'Overview & revenue metrics',
  },
  {
    pattern: /\/admin\/electricity/,
    files: ['src/services/electricityBilling.ts', 'src/services/meterElectricity.ts'],
    reason: 'Electricity billing',
  },
  {
    pattern: /\/admin\/pgs/,
    files: ['src/db/schema/pgs.ts', 'app/(admin)/admin/pgs/page.tsx'],
    reason: 'PG management',
  },
  {
    pattern: /\/admin/,
    files: ['app/(admin)/layout.tsx', 'src/lib/admin/navigation.ts'],
    reason: 'Admin shell',
  },
];

export async function loadCodebaseContext(pathname: string): Promise<
  Array<{ path: string; excerpt: string; reason: string }>
> {
  const cwd = process.cwd();
  const matched = ROUTE_FILES.find((r) => r.pattern.test(pathname)) ?? ROUTE_FILES.at(-1)!;
  const results: Array<{ path: string; excerpt: string; reason: string }> = [];
  let totalChars = 0;

  for (const rel of matched.files.slice(0, MAX_FILES)) {
    if (totalChars >= MAX_CHARS) break;
    try {
      const full = join(cwd, rel);
      const raw = await readFile(full, 'utf8');
      const excerpt = raw.slice(0, Math.min(1200, MAX_CHARS - totalChars));
      totalChars += excerpt.length;
      results.push({ path: rel, excerpt, reason: matched.reason });
    } catch {
      /* file missing in deploy bundle — skip */
    }
  }

  return results;
}
