/**
 * Read-only production audit — resident Pay All vs Bills Due projection.
 * Production mutation count: 0
 *
 * Usage:
 *   npx tsx scripts/audit-resident-pay-all-readonly.ts
 *   npx tsx scripts/audit-resident-pay-all-readonly.ts "Saswat"
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { loadResidentPaymentsTabData } from '@/src/services/residentPortalTabData';

loadProductionAuditEnv();
requireDatabaseUrl('audit-resident-pay-all-readonly');

function mockSession(customerId: string, email: string, fullName: string) {
  return {
    kind: 'customer' as const,
    sessionId: 'audit-script',
    customerId,
    email,
    fullName,
    phone: '+919999999999',
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function findResidents(search?: string) {
  if (search?.trim()) {
    const rows = await db.execute<{
      id: string;
      full_name: string;
      email: string;
    }>(sql`
      SELECT c.id, c.full_name, c.email
      FROM customers c
      INNER JOIN bookings b ON b.customer_id = c.id AND b.status = 'confirmed'
      WHERE c.full_name ILIKE ${'%' + search.trim() + '%'}
      ORDER BY c.full_name
      LIMIT 5
    `);
    return rows;
  }
  return db.execute<{
    id: string;
    full_name: string;
    email: string;
    tag: string;
  }>(sql`
    WITH samples AS (
      SELECT DISTINCT ON (tag)
        tag,
        c.id,
        c.full_name,
        c.email
      FROM (
        SELECT 'rent_due' AS tag, b.customer_id
        FROM rent_invoices ri
        INNER JOIN bookings b ON b.id = ri.booking_id
        WHERE ri.status IN ('pending', 'overdue', 'partial')
        LIMIT 1
      ) r
      INNER JOIN customers c ON c.id = r.customer_id
      UNION ALL
      SELECT 'elec_due', c.id, c.full_name, c.email
      FROM electricity_invoices ei
      INNER JOIN customers c ON c.id = ei.customer_id
      WHERE ei.status IN ('pending', 'overdue', 'partial')
      LIMIT 1
      UNION ALL
      SELECT 'room_change', c.id, c.full_name, c.email
      FROM financial_invoices fi
      INNER JOIN customers c ON c.id = fi.customer_id
      WHERE fi.source_table = 'room_change_fee' AND fi.status IN ('sent', 'overdue', 'partial')
      LIMIT 1
    )
    SELECT * FROM samples
  `);
}

async function auditResident(id: string, fullName: string, email: string) {
  const ctx = await loadResidentAccountContextSafe(id, email);
  if (!ctx.ok) {
    return { resident: fullName, error: ctx.reason };
  }
  const session = mockSession(id, email, fullName);
  const data = await loadResidentPaymentsTabData({ preloaded: ctx.ctx, session });
  const billsDue = data.enrichedDueRows.filter((r) => r.href);
  const rejected = data.rejectedBillRows.filter((r) => r.href);
  return {
    resident: fullName,
    billsDueCount: billsDue.length,
    billsDueTotalPaise: data.payableNowTotalPaise,
    payAllVisible: data.payAll.visible,
    payAllTotalPaise: data.payAll.totalPaise,
    payAllHref: data.payAll.href,
    rejectedCount: rejected.length,
    billsDueRows: billsDue.map((r) => ({ label: r.label, amountPaise: r.amountPaise, status: r.status })),
    expected:
      data.payableNowTotalPaise > 0
        ? data.payAll.visible && data.payAll.totalPaise === data.payableNowTotalPaise
        : !data.payAll.visible,
  };
}

async function main() {
  const search = process.argv[2];
  const residents = await findResidents(search);
  const results = [];
  for (const r of residents) {
    results.push(await auditResident(r.id, r.full_name, r.email));
  }
  console.log(JSON.stringify({ mutationCount: 0, results }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
