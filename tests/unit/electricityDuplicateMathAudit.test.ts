/**
 * Duplicate electricity math classification — one authoritative monthly pipeline.
 *
 * Classifications:
 *   CANONICAL  — authoritative calculation path
 *   RE-ROUTE   — must call canonical (or already does)
 *   DELETE     — remove if still computing independently
 *   AUDIT-ONLY — diagnostics; must not drive liability
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CLASSIFICATION = {
  'src/lib/billing/roomElectricityOccupancyCoverage.ts': 'CANONICAL',
  'src/lib/billing/roomElectricityOccupants.ts': 'CANONICAL',
  'src/lib/billing/roomElectricityMonthlyAllocation.ts': 'CANONICAL',
  'src/lib/billing/electricityBillBreakdownPure.ts': 'CANONICAL',
  'src/lib/billing/buildElectricityBillBreakdown.ts': 'CANONICAL',
  'src/lib/billing/assertElectricityBreakdownCommitReady.ts': 'CANONICAL',
  'src/services/electricityBilling.ts': 'CANONICAL',
  'src/lib/billing/roomElectricityTimeline.ts': 'RE-ROUTE',
  'src/services/roomElectricityAuditBundle.ts': 'RE-ROUTE',
  'src/lib/billing/electricityOccupantEligibility.ts': 'AUDIT-ONLY',
  'src/services/meterElectricity.ts': 'AUDIT-ONLY',
  'scripts/trace-room-203-harshad-electricity.ts': 'AUDIT-ONLY',
} as const;

test('canonical monthly allocation module exports the single allocator', () => {
  const source = readFileSync('src/lib/billing/roomElectricityMonthlyAllocation.ts', 'utf8');
  assert.match(source, /export function allocateMonthlyElectricityInvoices/);
});

test('createElectricityBill uses room occupants + monthly allocator — not bed eligibility', () => {
  const source = readFileSync('src/services/electricityBilling.ts', 'utf8');
  assert.match(source, /loadRoomElectricityOccupantsForMonth/);
  assert.match(source, /allocateMonthlyElectricityInvoices/);
  assert.doesNotMatch(source, /electricityOccupantEligibility|listBedOccupantsForBillingMonth/);
});

test('details/audit bundle does not invent a second amount engine', () => {
  const source = readFileSync('src/services/roomElectricityAuditBundle.ts', 'utf8');
  assert.match(source, /loadElectricityBillBreakdown|buildRoomElectricityAuditView/);
  assert.doesNotMatch(source, /allocateMonthlyElectricityInvoices/);
});

test('duplicate-math classification inventory is locked for release audit', () => {
  for (const [path, kind] of Object.entries(CLASSIFICATION)) {
    assert.ok(['CANONICAL', 'RE-ROUTE', 'DELETE', 'AUDIT-ONLY'].includes(kind), path);
    assert.doesNotThrow(() => readFileSync(path, 'utf8'), `missing path ${path}`);
  }
  const canonicalCount = Object.values(CLASSIFICATION).filter((k) => k === 'CANONICAL').length;
  assert.ok(canonicalCount >= 6);
});
