import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyCheckoutPreviousMeterReadingPresentation } from '@/src/lib/checkout/applyCheckoutPreviousMeterReading';
import type { ResolvedCheckoutPreviousMeterReading } from '@/src/lib/checkout/checkoutPreviousMeterReading';
import type { CheckoutSettlement } from '@/src/db/schema';

function settlement(overrides: Partial<CheckoutSettlement> = {}): CheckoutSettlement {
  return {
    id: 'settlement-1',
    electricityPreviousReading: null,
    electricityUnitRatePaise: null,
    ...overrides,
  } as CheckoutSettlement;
}

function baseline(
  overrides: Partial<ResolvedCheckoutPreviousMeterReading> = {},
): ResolvedCheckoutPreviousMeterReading {
  return {
    previousReadingUnits: 420,
    source: 'last_monthly_bill',
    sourceLabel: 'Sep 2026 monthly bill',
    lastBillingMonth: '2026-09-01',
    ratePerUnitPaise: 1600,
    available: true,
    ...overrides,
  };
}

describe('applyCheckoutPreviousMeterReadingPresentation', () => {
  test('uses SSOT baseline when DB has no saved previous reading', () => {
    const result = applyCheckoutPreviousMeterReadingPresentation(
      settlement(),
      baseline({ previousReadingUnits: 512 }),
    );
    assert.equal(result.electricityPreviousReading, '512');
    assert.equal(result.electricityPreviousReadingAuto, true);
    assert.equal(result.electricityPreviousReadingAvailable, true);
    assert.equal(result.electricityPreviousReadingSource, 'last_monthly_bill');
    assert.equal(result.electricityUnitRatePaise, 1600);
  });

  test('accepts zero as a valid previous reading from SSOT', () => {
    const result = applyCheckoutPreviousMeterReadingPresentation(
      settlement(),
      baseline({ previousReadingUnits: 0 }),
    );
    assert.equal(result.electricityPreviousReading, '0');
    assert.equal(result.electricityPreviousReadingAuto, true);
    assert.equal(result.electricityPreviousReadingAvailable, true);
  });

  test('never overwrites an admin-saved previous reading', () => {
    const result = applyCheckoutPreviousMeterReadingPresentation(
      settlement({ electricityPreviousReading: '999', electricityUnitRatePaise: 1600 }),
      baseline({ previousReadingUnits: 512 }),
    );
    assert.equal(result.electricityPreviousReading, '999');
    assert.equal(result.electricityPreviousReadingAuto, false);
    assert.equal(result.electricityPreviousReadingAvailable, true);
  });

  test('leaves blank when no baseline exists — does not fabricate zero', () => {
    const result = applyCheckoutPreviousMeterReadingPresentation(
      settlement(),
      baseline({ available: false, previousReadingUnits: null, source: 'none', sourceLabel: 'No prior reading' }),
    );
    assert.equal(result.electricityPreviousReading, null);
    assert.equal(result.electricityPreviousReadingAuto, false);
    assert.equal(result.electricityPreviousReadingAvailable, false);
    assert.equal(result.electricityPreviousReadingSource, 'none');
  });

  test('preserves settlement rate when SSOT also provides one', () => {
    const result = applyCheckoutPreviousMeterReadingPresentation(
      settlement({ electricityUnitRatePaise: 1800 }),
      baseline({ ratePerUnitPaise: 1600 }),
    );
    assert.equal(result.electricityUnitRatePaise, 1800);
  });
});

describe('checkout settlement previous reading wiring', () => {
  function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), 'utf8');
  }

  test('detail loader resolves room at vacating date and SSOT baseline server-side', () => {
    const src = read('src/services/checkoutSettlement.ts');
    assert.match(src, /resolveCheckoutSettlementRoomContext/);
    assert.match(src, /resolveCheckoutPreviousMeterReading/);
    assert.match(src, /applyCheckoutPreviousMeterReadingPresentation/);
  });

  test('room context uses stay_range at vacating date, not latest bed only', () => {
    const src = read('src/lib/checkout/checkoutSettlementRoomContext.ts');
    assert.match(src, /stay_range/);
    assert.match(src, /vacatingDate/);
    assert.doesNotMatch(src, /ORDER BY br\.created_at DESC/);
  });

  test('checkout electricity UI is read-only when auto-filled from SSOT', () => {
    const src = read('src/components/admin/CheckoutSettlementElectricitySection.tsx');
    assert.match(src, /electricityPreviousReadingAuto/);
    assert.match(src, /readOnly=\{previousReadingLocked\}/);
    assert.match(src, /No previous reading available/);
    assert.doesNotMatch(src, /last-electricity-reading\?billingMonth=/);
  });
});
