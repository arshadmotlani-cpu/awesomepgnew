/**
 * Resident portal — electricity pending state (Room Brain V2).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { billingMonthDisplayLabel } from '@/src/lib/residents/residentElectricityBillingState';
import { isRoomAwaitingElectricityBillGeneration } from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';

describe('Resident electricity billing pending UX', () => {
  it('billingMonthDisplayLabel formats month name', () => {
    assert.match(billingMonthDisplayLabel('2026-08-01'), /2026/);
  });

  it('awaiting states are not treated as financially clear', () => {
    assert.equal(isRoomAwaitingElectricityBillGeneration('awaiting_meter'), true);
    assert.equal(isRoomAwaitingElectricityBillGeneration('stale_meter'), true);
    assert.equal(isRoomAwaitingElectricityBillGeneration('paid'), false);
    assert.equal(isRoomAwaitingElectricityBillGeneration('bill_ready'), false);
  });

  it('ResidentPaymentsV2Hub shows pending card and suppresses misleading ₹0', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ResidentPaymentsV2Hub.tsx'),
      'utf8',
    );
    assert.match(src, /electricityBillingPending/);
    assert.match(src, /ResidentElectricityPendingCard/);
    assert.match(src, /hideZeroDueHeader/);
    assert.match(src, /showElectricityPending/);
  });

  it('payments tab loads electricity state from Room Brain via tab data', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPortalTabData.ts'),
      'utf8',
    );
    assert.match(src, /loadResidentElectricityBillingState/);
    assert.match(src, /electricityBillingPending/);
  });

  it('deposit refund preview checks checkout-month electricity pending state', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/deposits/depositRefundSettlementPreview.ts'),
      'utf8',
    );
    assert.match(src, /loadResidentElectricityBillingState/);
    assert.match(src, /showPendingCard/);
    assert.match(src, /electricityPending: true/);
  });

  it('resident refund card shows pending electricity label when estimate', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/vacating/ResidentMoveOutRefundCard.tsx'),
      'utf8',
    );
    assert.match(card, /electricityPending/);
    assert.match(card, />Pending</);
    assert.match(card, /electricity pending/);
  });
});
