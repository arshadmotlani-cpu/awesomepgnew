import { strict as assert } from 'node:assert';
import test from 'node:test';
import { jsonSafe } from '../../src/lib/depositPageDebug';
import { securityDepositForMode, type RateSnapshot } from '../../src/services/pricing';
import { sanitizeUnifiedDepositView } from '../../src/services/depositOperations';

test('securityDepositForMode coerces bigint bed rates without throwing', () => {
  const rate = {
    bedPriceId: 'bp1',
    dailyRatePaise: 0,
    weeklyRatePaise: 0,
    monthlyRatePaise: 150000n as unknown as number,
    securityDepositPaise: 0,
    dailySecurityDepositPaise: 0,
    weeklySecurityDepositPaise: 0,
    monthlySecurityDepositPaise: 0,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  } satisfies RateSnapshot;
  assert.equal(securityDepositForMode(rate, 'monthly'), 300000);
  assert.doesNotThrow(() => JSON.stringify({ websiteDepositPaise: securityDepositForMode(rate, 'daily') }));
});

test('jsonSafe coerces bigint in deposit wallet props', () => {
  const dirty = sanitizeUnifiedDepositView({
    bookingId: 'b1',
    customerId: 'c1',
    requiredPaise: 350000,
    collectedPaise: 350000,
    deductedPaise: 0,
    refundedPaise: 0,
    refundablePaise: 350000,
    depositDuePaise: 0,
    depositCollectionStatus: 'full',
    invoiceStatus: null,
    walletInSync: true,
    walletMismatchReason: null,
  });
  const safe = jsonSafe({ view: dirty, isFrozen: false });
  assert.doesNotThrow(() => JSON.stringify(safe));
  assert.equal(typeof safe.view.requiredPaise, 'number');
});

test('sanitizeUnifiedDepositView returns safe empty view for null input', () => {
  const view = sanitizeUnifiedDepositView(null);
  assert.equal(view.bookingId, '');
  assert.equal(view.requiredPaise, 0);
  assert.doesNotThrow(() => JSON.stringify(view));
});
