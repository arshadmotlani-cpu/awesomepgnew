/* eslint-disable no-console */
/**
 * Read-only production audit for RC seed stylists on Staff Performance.
 *   set -a && source .env.production.vercel && set +a && npx tsx scripts/investigate-rc-stylist-asha-readonly.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, gte, ilike, lt, sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import {
  fyhAdminUsers,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { testStaffWhere } from '@/src/hair/lib/testArtifactPatterns';
import { zonedLocalToUtc } from '@/src/hair/lib/salonTime';

const TZ = 'Asia/Kolkata';
const RANGE_FROM = '2026-09-01';
const RANGE_TO = '2026-09-30';

async function main() {
  const { db, close } = createHairClient({ max: 1 });
  try {
    const staffRows = await db
      .select()
      .from(fyhStaff)
      .where(ilike(fyhStaff.fullName, 'RC Stylist %'));

    const ashaLike = await db
      .select({ id: fyhStaff.id, fullName: fyhStaff.fullName, isActive: fyhStaff.isActive })
      .from(fyhStaff)
      .where(ilike(fyhStaff.fullName, '%asha%'));

    const allStaffCount = await db.execute<{ c: number }>(sql`SELECT count(*)::int AS c FROM fyh_staff`);
    const host = (() => {
      try {
        const u = process.env.HAIR_DATABASE_URL ?? process.env.HAIR_DATABASE_POSTGRES_URL ?? '';
        return new URL(u.replace(/^postgres:/, 'postgresql:')).hostname;
      } catch {
        return '(unknown)';
      }
    })();
    console.log('Hair DB host:', host);
    console.log('Total fyh_staff rows:', (allStaffCount[0] as { c: number })?.c);
    console.log('Names matching %asha%:', ashaLike);

    console.log('=== RC Stylist staff rows ===');
    for (const s of staffRows) {
      const [{ attrCount }] = await db
        .select({
          attrCount: sql<number>`count(*)::int`,
        })
        .from(fyhInvoiceLineAttributions)
        .where(eq(fyhInvoiceLineAttributions.staffId, s.id));

      console.log({
        id: s.id,
        fullName: s.fullName,
        role: s.role,
        isActive: s.isActive,
        organizationId: s.organizationId,
        email: s.email,
        phone: s.phone,
        createdAt: s.createdAt?.toISOString?.(),
        totalAttributions: Number(attrCount ?? 0),
      });
    }

    const from = zonedLocalToUtc(`${RANGE_FROM}T00:00:00`, TZ);
    const to = new Date(zonedLocalToUtc(`${RANGE_TO}T00:00:00`, TZ).getTime() + 86_400_000);

    console.log(`\n=== Attributions in ${RANGE_FROM} → ${RANGE_TO} (paid invoices) ===`);
    for (const s of staffRows) {
      const rows = await db
        .select({
          invoiceId: fyhInvoices.id,
          invoiceNumber: fyhInvoices.invoiceNumber,
          paidAt: fyhInvoices.paidAt,
          metric: fyhInvoiceLineAttributions.revenueMetric,
          paise: sql<number>`sum(${fyhInvoiceLineAttributions.attributedNetPaise})::bigint`,
          customerName: sql<string>`(SELECT full_name FROM fyh_customers c WHERE c.id = ${fyhInvoices.customerId} LIMIT 1)`,
        })
        .from(fyhInvoiceLineAttributions)
        .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
        .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
        .where(
          and(
            eq(fyhInvoiceLineAttributions.staffId, s.id),
            eq(fyhInvoices.status, 'paid'),
            gte(fyhInvoices.paidAt, from),
            lt(fyhInvoices.paidAt, to),
          ),
        )
        .groupBy(
          fyhInvoices.id,
          fyhInvoices.invoiceNumber,
          fyhInvoices.paidAt,
          fyhInvoiceLineAttributions.revenueMetric,
          fyhInvoices.customerId,
        );

      const total = rows.reduce((a, r) => a + Number(r.paise ?? 0), 0);
      console.log(`\n${s.fullName} (${s.id}): ${rows.length} line groups, total paise ${total}`);
      for (const r of rows.slice(0, 8)) {
        console.log(
          `  ${r.invoiceNumber} | ${r.paidAt?.toISOString?.()?.slice(0, 10)} | ${r.metric} | ₹${Number(r.paise) / 100} | customer=${r.customerName}`,
        );
      }
      if (rows.length > 8) console.log(`  … +${rows.length - 8} more`);
    }

    const testStaffCount = await db.execute<{ c: number }>(
      sql.raw(`SELECT count(*)::int AS c FROM fyh_staff WHERE ${testStaffWhere()}`),
    );
    const activeTestStaff = await db.execute<{ c: number }>(
      sql.raw(`SELECT count(*)::int AS c FROM fyh_staff WHERE is_active = true AND ${testStaffWhere()}`),
    );
    console.log('\n=== Other test-pattern staff ===');
    console.log(`testStaffWhere total: ${(testStaffCount[0] as { c: number })?.c}`);
    console.log(`active test-pattern staff: ${(activeTestStaff[0] as { c: number })?.c}`);

    const activeRc = staffRows.filter((s) => s.isActive);
    console.log(`\nActive RC stylists: ${activeRc.length}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
