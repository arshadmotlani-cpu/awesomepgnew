/**
 * Room OS Wave 3 — RFE via Bed Brain bridge tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  applyLedgerTotalsToSummary,
} from '@/src/roomOs/bridges/rfeBedBrainBridge';
import type { BookingLedgerSnapshot } from '@/src/roomOs/types';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function emptySummary(): ResidentFinancialSummary {
  return {
    customerId: 'c1',
    bookingId: 'b1',
    bookingCode: 'BK1',
    customerName: 'Resident',
    customerPhone: '999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    asOf: new Date().toISOString(),
    rent: { requiredPaise: 100, paidPaise: 50, outstandingPaise: 50, items: [{ id: 'r1' } as never] },
    deposit: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, refundablePaise: 0, items: [] },
    electricity: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] },
    other: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] },
    totals: { requiredPaise: 100, paidPaise: 50, outstandingPaise: 50 },
  };
}

function ledgerSnapshot(): BookingLedgerSnapshot {
  return {
    bookingId: 'b1',
    bookingCode: 'BK1',
    pgId: 'pg1',
    customerId: 'c1',
    asOf: '2026-08-01',
    rent: { requiredPaise: 200, receivedPaise: 100, outstandingPaise: 100, status: 'outstanding' },
    electricity: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, status: 'none' },
    deposit: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, refundablePaise: 0, status: 'none' },
    totals: { requiredPaise: 200, receivedPaise: 100, outstandingPaise: 100 },
    paymentState: 'clear',
    computedAt: new Date().toISOString(),
    snapshotVersion: 1,
    derivationRefs: [],
  };
}

describe('Room OS Wave 3 — RFE Bed Brain bridge', () => {
  test('applyLedgerTotalsToSummary preserves line items but replaces totals', () => {
    const merged = applyLedgerTotalsToSummary(emptySummary(), ledgerSnapshot());
    assert.equal(merged.rent.items.length, 1);
    assert.equal(merged.rent.outstandingPaise, 100);
    assert.equal(merged.totals.outstandingPaise, 100);
  });

  test('residentFinancialEngine routes totals through Bed Brain bridge', () => {
    const rfe = read('src/services/residentFinancialEngine.ts');
    assert.match(rfe, /buildBookingContextSnapshot/);
    assert.match(rfe, /applyLedgerTotalsToSummary/);
    assert.match(rfe, /computeBookingFinancialSummaryCore/);
  });

  test('Wave 3 cert check registered', () => {
    const catalog = read('src/roomOs/certification/catalog/v1/checks.ts');
    assert.match(catalog, /RFE_BED_BRAIN_BRIDGE/);
    const runner = read('src/roomOs/certification/runCertification.ts');
    assert.match(runner, /runRfeBedBrainBridgeChecks/);
  });
});
