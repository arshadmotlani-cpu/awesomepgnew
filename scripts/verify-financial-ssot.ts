#!/usr/bin/env npx tsx
/**
 * Static verification for financial SSOT sprint — no DB required.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function mustInclude(rel: string, needle: string, label: string) {
  const src = read(rel);
  assert.ok(src.includes(needle), `${label}: expected ${rel} to include "${needle}"`);
}

console.log('Financial SSOT verification…');

mustInclude(
  'src/services/revenueCommandCenter.ts',
  'financialMetricsEngine',
  'Revenue command center uses FinancialMetricsEngine',
);
mustInclude(
  'src/services/dashboardMetrics.ts',
  'getFinancialMetrics',
  'Dashboard metrics delegates to engine',
);
mustInclude(
  'src/components/admin/RevenueCommandCenter.tsx',
  'Read-only view',
  'Revenue UI is read-only copy',
);
mustInclude(
  'app/(admin)/admin/refunds/page.tsx',
  'RefundConsoleWorkspace',
  'Refund Console page exists',
);
mustInclude(
  'src/lib/billing/billingCycleEngine.ts',
  'shouldGenerateBillOnDate',
  'Billing Cycle Engine exported',
);
mustInclude(
  'app/(admin)/admin/invoices/page.tsx',
  'InvoiceFinancialTimelineCollapsible',
  'Invoice timeline collapsed at bottom',
);
mustInclude(
  'src/components/customer/customerBedUi.tsx',
  'isMaintenance',
  'Maintenance beds viewable on website',
);

const revenueUi = read('src/components/admin/RevenueCommandCenter.tsx');
assert.ok(
  !revenueUi.includes('byPg.reduce') || revenueUi.includes('depositPaidCount'),
  'Revenue UI must not independently sum revenue totals from PG rows',
);

mustInclude(
  'app/(admin)/admin/bookings/[bookingId]/financial/page.tsx',
  'BookingFinancialWorkspace',
  'Booking financial workspace page exists',
);
mustInclude(
  'src/services/depositCollection.ts',
  'closeUncollectedDepositDue',
  'Post-checkout uncollected deposit closer exists',
);
mustInclude(
  'src/lib/bookings/bookingFinancialLinks.ts',
  'bookingFinancialWorkspaceHref',
  'Canonical financial workspace href helper exists',
);

console.log('OK — financial SSOT static checks passed.');
