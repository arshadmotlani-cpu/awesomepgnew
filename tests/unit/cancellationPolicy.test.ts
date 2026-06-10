import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY,
  computeRefund,
  type CancellationPolicy,
} from '../../src/services/cancellationPolicy';

const rent = 30_000_00; // ₹30,000 in paise
const deposit = 20_000_00; // ₹20,000 in paise

function at(date: string): Date {
  return new Date(date);
}

describe('cancellationPolicy.computeRefund', () => {
  it('full refund tier: ≥ 7 days before check-in returns 100% rent + 100% deposit', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-10T00:00:00Z'), // 240h before
    });
    assert.equal(r.tier, 'full');
    assert.equal(r.rentRefundPaise, rent);
    assert.equal(r.depositRefundPaise, deposit);
    assert.equal(r.totalRefundPaise, rent + deposit);
    assert.equal(r.refundable, true);
  });

  it('partial refund tier: 24h–7d before check-in returns 50% rent + 100% deposit', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-17T00:00:00Z'), // 72h before
    });
    assert.equal(r.tier, 'partial');
    assert.equal(r.rentRefundPaise, rent / 2);
    assert.equal(r.depositRefundPaise, deposit);
    assert.equal(r.totalRefundPaise, rent / 2 + deposit);
  });

  it('no-refund tier: < 24h before check-in returns 0% rent but still 100% deposit', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-19T12:00:00Z'), // 12h before
    });
    assert.equal(r.tier, 'none');
    assert.equal(r.rentRefundPaise, 0);
    assert.equal(r.depositRefundPaise, deposit);
    assert.equal(r.totalRefundPaise, deposit);
  });

  it('post-checkin cancellation: negative hoursBefore → no rent refund, deposit still 100%', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-25T00:00:00Z'), // 5 days AFTER check-in
    });
    assert.equal(r.tier, 'none');
    assert.equal(r.rentRefundPaise, 0);
    assert.equal(r.depositRefundPaise, deposit);
    assert.ok(r.hoursBeforeCheckIn < 0);
  });

  it('boundary: exactly fullRefundUntilHrsBefore (168h) qualifies for full refund', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-13T00:00:00Z'), // exactly 168h
    });
    assert.equal(r.tier, 'full');
  });

  it('boundary: exactly partialRefundUntilHrsBefore (24h) qualifies for partial refund', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-19T00:00:00Z'), // exactly 24h
    });
    assert.equal(r.tier, 'partial');
    assert.equal(r.rentRefundPaise, rent / 2);
  });

  it('zero deposit booking: breakdown excludes deposit lines', () => {
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: 0,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-10T00:00:00Z'),
    });
    assert.equal(r.depositRefundPaise, 0);
    assert.ok(!r.breakdown.some((l) => l.kind === 'deposit_refund'));
    assert.ok(!r.breakdown.some((l) => l.kind === 'deposit_forfeit'));
  });

  it('breakdown always sums back to rent + deposit (conservation of money)', () => {
    for (const cancelAt of [
      '2026-12-10T00:00:00Z',
      '2026-12-17T00:00:00Z',
      '2026-12-19T12:00:00Z',
      '2026-12-25T00:00:00Z',
    ]) {
      const r = computeRefund({
        rentSubtotalPaise: rent,
        depositPaise: deposit,
        checkInAt: at('2026-12-20T00:00:00Z'),
        cancelAt: at(cancelAt),
      });
      const totalLines = r.breakdown.reduce((a, l) => a + l.amountPaise, 0);
      assert.equal(
        totalLines,
        rent + deposit,
        `breakdown for cancelAt=${cancelAt} doesn't conserve money: ${totalLines}`,
      );
    }
  });

  it('custom policy: stricter window only refunds the day before', () => {
    const strict: CancellationPolicy = {
      fullRefundUntilHrsBefore: 720, // 30 days
      partialRefundUntilHrsBefore: 168, // 7 days
      partialRefundPct: 25,
      depositRefundPct: 100,
      label: 'Strict',
    };
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-10T00:00:00Z'), // 240h before
      policy: strict,
    });
    // 240h is < 720h (full) but >= 168h (partial)
    assert.equal(r.tier, 'partial');
    assert.equal(r.rentRefundPaise, Math.round(rent * 0.25));
  });

  it('clamps absurd policy percentages to [0, 100]', () => {
    const wonky: CancellationPolicy = {
      ...DEFAULT_POLICY,
      partialRefundPct: 250, // absurd
      depositRefundPct: -50, // absurd
    };
    const r = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: deposit,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-17T00:00:00Z'), // partial window
      policy: wonky,
    });
    assert.equal(r.rentRefundPaise, rent); // 100% cap
    assert.equal(r.depositRefundPaise, 0); // 0% floor
  });

  it('refundable=false when nothing comes back', () => {
    const zeroDeposit = computeRefund({
      rentSubtotalPaise: rent,
      depositPaise: 0,
      checkInAt: at('2026-12-20T00:00:00Z'),
      cancelAt: at('2026-12-19T12:00:00Z'),
    });
    assert.equal(zeroDeposit.refundable, false);
  });
});
