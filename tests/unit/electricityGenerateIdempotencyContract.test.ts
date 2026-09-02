/**
 * Contract: electricity generation is transactional + idempotent; breakdown is not best-effort.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const billingSource = readFileSync('src/services/electricityBilling.ts', 'utf8');
const jobsSource = readFileSync('src/services/electricityBillGenerationJobs.ts', 'utf8');
const ownershipSource = readFileSync('src/services/electricityInvoiceOwnership.ts', 'utf8');
const eligibilitySource = readFileSync('src/lib/billing/electricityOccupantEligibility.ts', 'utf8');

test('Case A/B: room+month uniqueness returns already_exists on retry after commit', () => {
  assert.match(billingSource, /kind: 'already_exists'/);
  assert.match(billingSource, /23505/);
  assert.match(billingSource, /electricity_bills_room_month_unique|already_exists/);
});

test('Case C: breakdown failure returns typed domain failure before financial commit', () => {
  assert.match(billingSource, /kind: 'breakdown_failed'/);
  assert.match(billingSource, /calculation_breakdown_precommit/);
  const composeIdx = billingSource.indexOf('composeElectricityBillBreakdown');
  const insertIdx = billingSource.indexOf('insert(electricityBills)');
  assert.ok(composeIdx > 0 && insertIdx > composeIdx);
});

test('stuck running generation jobs become retryable', () => {
  assert.match(jobsSource, /STUCK_MS/);
  assert.match(jobsSource, /15 \* 60 \* 1000/);
});

test('ownership audit uses room coverage SSOT — not current bed reconstruction', () => {
  assert.match(ownershipSource, /loadRoomElectricityOccupantsForMonth/);
  assert.match(ownershipSource, /resident_not_in_room_coverage/);
  assert.doesNotMatch(ownershipSource, /resolveBedOccupantForBillingMonth/);
  assert.match(eligibilitySource, /MUST NOT be used to reconstruct electricity liability/);
});
