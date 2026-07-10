#!/usr/bin/env npx tsx
/**
 * Read-only Production Stabilization audit (Phases 1, 2, 4).
 *
 * Loads `.env.prod.live` automatically when present.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('production-stabilization-audit.ts');

import { and, desc, eq, gt, ilike, isNull, sql } from 'drizzle-orm';
import {
  authSessions,
  customers,
  electricityBills,
  electricityInvoices,
  pgPaymentCategories,
  pgs,
  rentInvoices,
  rooms,
  floors,
} from '@/src/db/schema';
import { env } from '@/src/lib/env';
import { getDatabaseHost } from '@/src/lib/db/env';
import {
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { getElectricityDailyCategory, getRentDepositBookingCategory } from '@/src/services/pgPaymentDefaults';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { paiseToInr } from '@/src/lib/format';
import { db, closeDb } from '@/src/db/client';

const WRITE_DOCS = process.argv.includes('--write-docs');
const BILLING_MONTH = '2026-06-01';
const OUT_DIR = join(process.cwd(), 'docs', 'PRODUCTION_STABILIZATION');

type Report = {
  generatedAt: string;
  databaseHostHint: string;
  phase1: Record<string, unknown>;
  phase2: Record<string, unknown>;
  phase4: Record<string, unknown>;
};

function maskSecret(name: string, value: string | undefined): string {
  if (!value?.trim()) return '(unset — using code default)';
  if (name.includes('SECRET') || name.includes('PASSWORD') || name.includes('KEY')) {
    return `(set, len=${value.length})`;
  }
  return value;
}

async function auditPhase1(): Promise<Record<string, unknown>> {
  const [sessionStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${authSessions.expiresAt} > now() and ${authSessions.kind} = 'customer')::int`,
      expired: sql<number>`count(*) filter (where ${authSessions.expiresAt} <= now() and ${authSessions.kind} = 'customer')::int`,
      rememberMe: sql<number>`count(*) filter (where ${authSessions.rememberMe} = true and ${authSessions.expiresAt} > now())::int`,
    })
    .from(authSessions);

  const recentSessions = await db
    .select({
      id: authSessions.id,
      subjectId: authSessions.subjectId,
      rememberMe: authSessions.rememberMe,
      expiresAt: authSessions.expiresAt,
      lastSeenAt: authSessions.lastSeenAt,
      createdAt: authSessions.createdAt,
      userAgent: authSessions.userAgent,
    })
    .from(authSessions)
    .where(and(eq(authSessions.kind, 'customer'), sql`${authSessions.expiresAt} > now()`))
    .orderBy(desc(authSessions.lastSeenAt))
    .limit(15);

  const [archivedWithSessions] = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c
    FROM auth_sessions s
    INNER JOIN customers c ON c.id = s.subject_id
    WHERE s.kind = 'customer'
      AND s.expires_at > now()
      AND c.archived_at IS NOT NULL
  `);

  const duplicatePhoneClusters = await db.execute<{ phone_digits: string; cnt: number }>(sql`
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') AS phone_digits, count(*)::int AS cnt
    FROM customers
    WHERE archived_at IS NULL AND phone IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `);

  const harshalSessions = await db.execute(sql`
    SELECT s.id, s.remember_me, s.expires_at, s.last_seen_at, s.created_at,
           c.full_name, c.phone, c.archived_at
    FROM auth_sessions s
    JOIN customers c ON c.id = s.subject_id
    WHERE c.phone LIKE '%7083608128%'
    ORDER BY s.created_at DESC
    LIMIT 10
  `);

  return {
    env: {
      NODE_ENV: maskSecret('NODE_ENV', process.env.NODE_ENV),
      AUTH_CUSTOMER_SESSION_DAYS: env.AUTH_CUSTOMER_SESSION_DAYS,
      AUTH_CUSTOMER_REMEMBER_DAYS: env.AUTH_CUSTOMER_REMEMBER_DAYS,
      AUTH_CUSTOMER_SESSION_REFRESH_DAYS: env.AUTH_CUSTOMER_SESSION_REFRESH_DAYS,
      AUTH_SECRET: maskSecret('AUTH_SECRET', process.env.AUTH_SECRET),
    },
    codeDefaults: {
      standardSessionDays: 7,
      rememberSessionDays: 75,
      refreshThresholdDays: 14,
      clientRefreshIntervalMinutes: 20,
    },
    sessionStats,
    archivedWithActiveSessions: Number(
      (archivedWithSessions as { c: number } | undefined)?.c ?? 0,
    ),
    duplicatePhoneClusters,
    recentActiveSessions: recentSessions,
    harshalPhoneSessions: harshalSessions,
    findings: [
      sessionStats?.active === 0
        ? 'No active customer sessions in DB (residents may not be logged in recently).'
        : null,
      Number((archivedWithSessions as { c: number } | undefined)?.c ?? 0) > 0
        ? 'Archived customers have active auth_sessions — server rejects but cookie may persist.'
        : null,
      (duplicatePhoneClusters as { cnt: number }[]).length > 0
        ? 'Duplicate phone clusters among non-archived customers — split-identity risk.'
        : null,
    ].filter(Boolean),
  };
}

async function auditPhase2Room203(): Promise<Record<string, unknown>> {
  const [room] = await db
    .select({ id: rooms.id, roomNumber: rooms.roomNumber, pgName: pgs.name })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(rooms.roomNumber, '203'), ilike(pgs.name, '%shanti%')))
    .limit(1);

  if (!room) {
    return { error: 'Room 203 Shantinagar not found' };
  }

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
  });

  const [bill] = await db
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      calculationBreakdown: electricityBills.calculationBreakdown,
      billStatus: electricityBills.billStatus,
    })
    .from(electricityBills)
    .where(
      and(eq(electricityBills.roomId, room.id), eq(electricityBills.billingMonth, BILLING_MONTH)),
    )
    .limit(1);

  const invoices = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
      paidPaise: electricityInvoices.paidPaise,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.roomId, room.id),
        eq(electricityInvoices.billingMonth, BILLING_MONTH),
      ),
    );

  const customerNames = await db
    .select({ id: customers.id, fullName: customers.fullName, phone: customers.phone })
    .from(customers)
    .where(
      sql`${customers.id} IN (${sql.join(
        invoices.map((i) => sql`${i.customerId}`),
        sql`, `,
      )})`,
    );

  const nameById = new Map(customerNames.map((c) => [c.id, c]));

  const ledgerView = await getElectricitySettlementLedgerView({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
  });

  const invoiceRows = invoices.map((inv) => ({
    ...inv,
    amountInr: paiseToInr(inv.amountPaise),
    residentName: nameById.get(inv.customerId)?.fullName ?? '?',
    phone: nameById.get(inv.customerId)?.phone ?? '?',
  }));

  const invoiceSum = invoices.reduce((s, i) => s + i.amountPaise, 0);

  return {
    room,
    billingMonth: BILLING_MONTH,
    bill: bill
      ? {
          ...bill,
          grossTotalInr: paiseToInr(bill.totalPaise),
          breakdown: bill.calculationBreakdown,
        }
      : null,
    occupants: occupantLoad.occupants.map((o) => ({
      customerId: o.customerId,
      bookingId: o.bookingId,
      bedCount: o.bedCount,
      weight: o.weight,
    })),
    invoices: invoiceRows,
    invoiceSumPaise: invoiceSum,
    invoiceSumInr: paiseToInr(invoiceSum),
    ledgerView: ledgerView
      ? {
          totalRoomBillPaise: ledgerView.totalRoomBillPaise,
          remainingRoomBalancePaise: ledgerView.remainingRoomBalancePaise,
          reconciliationGapPaise: ledgerView.reconciliationGapPaise,
          isBalanced: ledgerView.isBalanced,
        }
      : null,
    findings: [
      bill && invoiceSum !== bill.totalPaise
        ? `Invoice sum (${paiseToInr(invoiceSum)}) ≠ bill gross (${paiseToInr(bill.totalPaise)})`
        : null,
      ledgerView && ledgerView.reconciliationGapPaise !== 0
        ? `Room reconciliation gap: ${paiseToInr(ledgerView.reconciliationGapPaise)}`
        : null,
      ledgerView && !ledgerView.isBalanced ? 'Room ledger reports isBalanced=false' : null,
    ].filter(Boolean),
  };
}

async function auditPhase4Upi(): Promise<Record<string, unknown>> {
  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(isNull(pgs.archivedAt))
    .orderBy(pgs.name);

  const categories = await db
    .select({
      pgId: pgPaymentCategories.pgId,
      name: pgPaymentCategories.name,
      upiId: pgPaymentCategories.upiId,
      qrCodeImageUrl: pgPaymentCategories.qrCodeImageUrl,
    })
    .from(pgPaymentCategories);

  const byPg: Record<string, unknown>[] = [];

  for (const pg of pgRows) {
    const rentCat = await getRentDepositBookingCategory(pg.id);
    const elecCat = await getElectricityDailyCategory(pg.id);
    const pgCats = categories.filter((c) => c.pgId === pg.id);

    byPg.push({
      pgId: pg.id,
      pgName: pg.name,
      slug: pg.slug,
      categoriesInDb: pgCats,
      resolvedRentUpi: rentCat?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID,
      resolvedRentFromDefault: !rentCat?.upiId,
      resolvedElecUpi: elecCat?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID,
      resolvedElecFromDefault: !elecCat?.upiId,
      rentQr: rentCat?.qrCodeImageUrl ?? null,
      elecQr: elecCat?.qrCodeImageUrl ?? null,
    });
  }

  const mismatches = byPg.filter(
    (p) =>
      (p.resolvedRentFromDefault as boolean) ||
      (p.resolvedElecFromDefault as boolean) ||
      (p.categoriesInDb as unknown[]).length === 0,
  );

  return {
    codeFallbacks: {
      rentDeposit: DEFAULT_RENT_DEPOSIT_UPI_ID,
      electricityDaily: DEFAULT_ELECTRICITY_DAILY_UPI_ID,
    },
    paymentProvider: maskSecret('PAYMENT_PROVIDER', process.env.PAYMENT_PROVIDER),
    pgCount: pgRows.length,
    byPg,
    findings: [
      mismatches.length > 0
        ? `${mismatches.length} PG(s) using fallback UPI or missing categories`
        : 'All PGs have explicit payment categories',
      'Verify fuzzy getPgQrForPurpose vs exact resolvers separately in code audit',
    ],
  };
}

function renderMarkdown(report: Report): string {
  return `# Production Stabilization — Automated Audit Report

**Generated:** ${report.generatedAt}  
**Database:** ${report.databaseHostHint}

---

## Phase 1 — Auth & Sessions

\`\`\`json
${JSON.stringify(report.phase1, null, 2)}
\`\`\`

---

## Phase 2 — Room 203 Electricity (${BILLING_MONTH})

\`\`\`json
${JSON.stringify(report.phase2, null, 2)}
\`\`\`

---

## Phase 4 — UPI Inventory

\`\`\`json
${JSON.stringify(report.phase4, null, 2)}
\`\`\`
`;
}

async function main() {
  const dbHost = getDatabaseHost() ?? 'unknown';
  console.log('Production Stabilization Audit (read-only)');
  console.log('Database host:', dbHost);

  const report: Report = {
    generatedAt: new Date().toISOString(),
    databaseHostHint: dbHost,
    phase1: await auditPhase1(),
    phase2: await auditPhase2Room203(),
    phase4: await auditPhase4Upi(),
  };

  console.log('\n=== Phase 1 findings ===');
  console.log(report.phase1.findings);
  console.log('\n=== Phase 2 findings ===');
  console.log(report.phase2.findings);
  console.log('\n=== Phase 4 findings ===');
  console.log(report.phase4.findings);

  if (WRITE_DOCS) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'AUDIT_REPORT.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(OUT_DIR, 'AUDIT_REPORT.md'), renderMarkdown(report));
    console.log(`\nWrote ${OUT_DIR}/AUDIT_REPORT.{json,md}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
