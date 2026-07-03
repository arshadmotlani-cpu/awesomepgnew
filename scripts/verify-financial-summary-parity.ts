#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Live parity check — Overview, Operations, Billing Center, and Revenue must
 * agree on every outstanding invoice count and amount.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/verify-financial-summary-parity.ts
 */
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { loadBillingCommandCenterSnapshot } from '../src/services/billingCommandCenter';
import { getOperationsCenterData } from '../src/services/operationsCenter';
import { loadOverviewContext } from '../src/services/overviewData';
import {
  buildInvoiceBreakdownReport,
  computeOutstandingMoneyFromInvoices,
  loadInvoiceOutstandingSnapshot,
} from '../src/services/financialSummaryService';
import { getDepositPortfolioMetrics } from '../src/services/depositLedgerMetrics';

type ParityRow = {
  label: string;
  overview: number | string;
  operations: number | string;
  billing: number | string;
  revenue: number | string;
  ssot: number | string;
};

async function getSession(): Promise<AdminSession> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  if (!admin) throw new Error('No super_admin user found');
  return {
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

function assertEqual(label: string, values: Record<string, number>): void {
  const entries = Object.entries(values);
  const expected = entries[0]![1];
  for (const [surface, value] of entries) {
    if (value !== expected) {
      console.error(`MISMATCH: ${label}`);
      console.error(values);
      process.exitCode = 1;
      return;
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const session = await getSession();
  const [snapshot, billing, operations, overview, depositPortfolio] = await Promise.all([
    loadInvoiceOutstandingSnapshot(session),
    loadBillingCommandCenterSnapshot(session),
    getOperationsCenterData(session),
    loadOverviewContext(session, undefined, { syncActions: false }),
    getDepositPortfolioMetrics(),
  ]);

  if (!overview.ok) {
    console.error('Failed to load overview:', overview.error);
    process.exit(1);
  }

  const ssot = computeOutstandingMoneyFromInvoices(snapshot);
  const breakdown = buildInvoiceBreakdownReport(snapshot);
  const revenue = overview.data.revenue;

  console.log('\n=== Invoice breakdown (SSOT) ===\n');
  console.log('Rent invoices');
  console.log(`  Generated (open query): ${breakdown.rent.generated}`);
  console.log(`  Paid (in open set):     ${breakdown.rent.paid}`);
  console.log(`  Partially paid:         ${breakdown.rent.partiallyPaid}`);
  console.log(`  Outstanding amount:     ₹${breakdown.rent.outstandingPaise / 100}`);
  console.log('\nElectricity invoices');
  console.log(`  Generated (open query): ${breakdown.electricity.generated}`);
  console.log(`  Partially paid:         ${breakdown.electricity.partiallyPaid}`);
  console.log(`  Outstanding amount:     ₹${breakdown.electricity.outstandingPaise / 100}`);
  console.log('\nDeposits');
  console.log(`  Collected MTD:          ₹${depositPortfolio.collectedMtdPaise / 100}`);
  console.log(`  Refunded MTD:           ₹${depositPortfolio.refundedMtdPaise / 100}`);
  console.log(`  Held (outstanding):     ₹${depositPortfolio.heldPaise / 100}`);

  const rows: ParityRow[] = [
    {
      label: 'Rent due count',
      overview: ssot.pendingRentInvoices,
      operations: '—',
      billing: billing.rentWaitingCount,
      revenue: revenue.outstanding.pendingRentInvoices,
      ssot: ssot.pendingRentInvoices,
    },
    {
      label: 'Rent outstanding (₹)',
      overview: revenue.outstanding.pendingRentInvoicesPaise,
      operations: '—',
      billing: billing.totalOutstandingPaise,
      revenue: revenue.outstanding.pendingRentInvoicesPaise,
      ssot: ssot.pendingRentInvoicesPaise,
    },
    {
      label: 'Electricity due count',
      overview: overview.data.invoiceOutstanding.pendingElectricityInvoices,
      operations: operations.electricityPending.count,
      billing: billing.electricityWaitingCount,
      revenue: revenue.outstanding.pendingElectricityInvoices,
      ssot: ssot.pendingElectricityInvoices,
    },
    {
      label: 'Electricity outstanding (₹)',
      overview: revenue.outstanding.pendingElectricityInvoicesPaise,
      operations: operations.electricityPending.items.reduce((s, i) => s + i.amountDuePaise, 0),
      billing: billing.totalOutstandingPaise,
      revenue: revenue.outstanding.pendingElectricityInvoicesPaise,
      ssot: ssot.pendingElectricityInvoicesPaise,
    },
    {
      label: 'Total outstanding (₹)',
      overview: revenue.outstanding.totalOutstandingPaise,
      operations: '—',
      billing: billing.totalOutstandingPaise,
      revenue: revenue.outstanding.totalOutstandingPaise,
      ssot: ssot.totalOutstandingPaise,
    },
  ];

  console.log('\n=== Surface parity ===\n');
  console.table(rows);

  assertEqual('Rent due count', {
    overview: overview.data.invoiceOutstanding.pendingRentInvoices,
    billing: billing.rentWaitingCount,
    revenue: revenue.outstanding.pendingRentInvoices,
    ssot: ssot.pendingRentInvoices,
  });
  assertEqual('Rent outstanding', {
    overview: revenue.outstanding.pendingRentInvoicesPaise,
    revenue: revenue.outstanding.pendingRentInvoicesPaise,
    ssot: ssot.pendingRentInvoicesPaise,
  });
  assertEqual('Electricity due count', {
    overview: overview.data.invoiceOutstanding.pendingElectricityInvoices,
    operations: operations.electricityPending.count,
    billing: billing.electricityWaitingCount,
    revenue: revenue.outstanding.pendingElectricityInvoices,
    ssot: ssot.pendingElectricityInvoices,
  });
  assertEqual('Electricity outstanding', {
    overview: revenue.outstanding.pendingElectricityInvoicesPaise,
    operations: operations.electricityPending.items.reduce((s, i) => s + i.amountDuePaise, 0),
    revenue: revenue.outstanding.pendingElectricityInvoicesPaise,
    ssot: ssot.pendingElectricityInvoicesPaise,
  });
  assertEqual('Total outstanding', {
    overview: revenue.outstanding.totalOutstandingPaise,
    revenue: revenue.outstanding.totalOutstandingPaise,
    ssot: ssot.totalOutstandingPaise,
  });

  if (process.exitCode === 1) {
    console.error('\nFAILED — at least one surface disagrees with the invoice SSOT.\n');
  } else {
    console.log('\nOK — all surfaces match the shared financial summary service.\n');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
