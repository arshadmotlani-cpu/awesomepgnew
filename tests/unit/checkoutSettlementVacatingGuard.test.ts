import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  vacatingStatusAllowsCheckoutSettlement,
} from '../../src/lib/vacating/checkoutSettlementEligibility';

test('vacatingStatusAllowsCheckoutSettlement — approved and completed only', () => {
  assert.equal(vacatingStatusAllowsCheckoutSettlement('approved'), true);
  assert.equal(vacatingStatusAllowsCheckoutSettlement('completed'), true);
  assert.equal(vacatingStatusAllowsCheckoutSettlement('pending'), false);
  assert.equal(vacatingStatusAllowsCheckoutSettlement('rejected'), false);
});

test('createCheckoutSettlementFromVacating blocks pending monthly with audit action', () => {
  const source = readFileSync('src/services/checkoutSettlement.ts', 'utf8');
  assert.match(source, /create_blocked_pending_vacating/);
  assert.match(source, /logBlockedPrematureCheckoutSettlement/);
  assert.match(source, /vacatingStatusAllowsCheckoutSettlement/);
  assert.match(source, /callerContext\?: string/);
});

test('internal callers pass callerContext', () => {
  const source = readFileSync('src/services/checkoutSettlement.ts', 'utf8');
  assert.match(source, /callerContext: 'ensureCheckoutSettlementForBooking'/);
  assert.match(source, /callerContext: 'ensureEmergencyCheckoutForBooking'/);
  assert.match(source, /callerContext: 'rebuildCheckoutSettlement'/);
});
