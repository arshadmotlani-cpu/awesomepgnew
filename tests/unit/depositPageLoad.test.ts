import { strict as assert } from 'node:assert';
import test from 'node:test';
import { assertJsonSerializable, jsonSafe } from '../../src/lib/depositPageDebug';
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

test('assertJsonSerializable rejects bigint in unified deposit view props', () => {
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
  assert.doesNotThrow(() => assertJsonSerializable('client_props_wallet', 'b1', { view: dirty, isFrozen: false }));

  const broken = { ...dirty, collectedPaise: 350000n as unknown as number };
  assert.throws(() =>
    assertJsonSerializable('client_props_wallet', 'b1', { view: broken, isFrozen: false }),
  );
});

test('jsonSafe converts bigint ledger snapshots for logging', () => {
  const safe = jsonSafe({
    bookingId: 'b1',
    collectedPaise: 350000n,
    entries: [{ amountPaise: 350000n }],
  });
  assert.equal(safe.collectedPaise, 350000);
  assert.equal(safe.entries[0].amountPaise, 350000);
  assert.doesNotThrow(() => JSON.stringify(safe));
});
