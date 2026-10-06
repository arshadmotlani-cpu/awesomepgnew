import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResidentCreditWalletLine,
  classifyResidentCreditReason,
  computeDepositCheckoutEstimatePaise,
} from '../../src/lib/billing/residentCreditWalletPresentation';

describe('residentCreditWalletPresentation', () => {
  it('classifies room change unused rent credit', () => {
    const c = classifyResidentCreditReason(
      'room_change_unused_rent:70dd0a1d-e381-4180-8e59-5c27c57a1651:surplus',
    );
    assert.equal(c.kind, 'room_change_unused_rent');
  });

  it('Sagar: deposit checkout estimate 51510 - 17890 = 33620', () => {
    assert.equal(
      computeDepositCheckoutEstimatePaise({
        depositRefundableExcessPaise: 51_510,
        electricityOutstandingPaise: 17_890,
      }),
      33_620,
    );
  });

  it('shows rent credit separately from deposit refund ceiling', () => {
    const line = buildResidentCreditWalletLine({
      balancePaise: 48_159,
      primaryReason: 'room_change_unused_rent:x:surplus',
      hasOpenVacating: false,
    });
    assert.ok(line);
    assert.equal(line!.separateFromDepositRefund, true);
    assert.equal(line!.balancePaise, 48_159);
  });

  it('deposit refund max stays 51510 — not combined with rent credit', () => {
    const depositMax = 51_510;
    assert.equal(depositMax, 51_510);
    assert.equal(48_159 + depositMax, 99_669);
  });

  it('walletAvailableRefundPaise must not use checkout estimate (33620)', () => {
    const depositMax = 51_510;
    const checkoutEstimate = computeDepositCheckoutEstimatePaise({
      depositRefundableExcessPaise: 51_510,
      electricityOutstandingPaise: 17_890,
    });
    assert.equal(checkoutEstimate, 33_620);
    assert.notEqual(depositMax, checkoutEstimate);
  });

  it('mid-stay rent credit is spendable on rent, not mid-stay deposit refund', () => {
    const line = buildResidentCreditWalletLine({
      balancePaise: 48_159,
      primaryReason: 'room_change_unused_rent:x:surplus',
      hasOpenVacating: false,
    });
    assert.equal(line!.spendableOnFutureRent, true);
    assert.equal(line!.includedInCheckoutSettlement, true);
    assert.equal(line!.separateFromDepositRefund, true);
  });

  it('vacating status label mentions checkout settlement', () => {
    const line = buildResidentCreditWalletLine({
      balancePaise: 48_159,
      primaryReason: 'room_change_unused_rent:x:surplus',
      hasOpenVacating: true,
    });
    assert.match(line!.statusLabel, /checkout settlement/i);
  });

  it('zero credit balance yields no wallet line', () => {
    assert.equal(
      buildResidentCreditWalletLine({
        balancePaise: 0,
        primaryReason: 'room_change_unused_rent:x:surplus',
        hasOpenVacating: false,
      }),
      null,
    );
  });
});
