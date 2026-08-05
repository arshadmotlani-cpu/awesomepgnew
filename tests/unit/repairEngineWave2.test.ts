import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeHealthScore,
  fingerprintForIssue,
  resolveRepairFnForIssue,
} from '@/src/lib/health/repairEngine';
import type { HealthIssue } from '@/src/lib/health/healthBrain';
import {
  isExampleComProofUrl,
  isSentinelBillingMonth,
  matchesSyntheticRentRow,
} from '@/src/lib/health/syntheticPollutionCleanup';
import { HEALTH_BRAIN_SAFE_REPAIRS } from '@/src/lib/health/healthBrain';

function issue(partial: Partial<HealthIssue> & Pick<HealthIssue, 'code' | 'brain'>): HealthIssue {
  return {
    id: 'x',
    severity: 'P1',
    entityType: 'booking',
    entityId: 'b1',
    cause: 'test',
    suggestedRepair: 'test',
    autoRepairAvailable: true,
    status: 'repair_available',
    ...partial,
  };
}

describe('repairEngine', () => {
  it('fingerprints and scores issues', () => {
    const i = issue({ brain: 'Resident', code: 'MISSING_CURRENT_MONTH_RENT', entityId: 'bk' });
    assert.equal(fingerprintForIssue(i), 'Resident:MISSING_CURRENT_MONTH_RENT:bk');
    assert.equal(computeHealthScore([]), 100);
    assert.ok(computeHealthScore([issue({ brain: 'Health', code: 'X', severity: 'P0' })]) < 100);
  });

  it('resolves conservative repair fns', () => {
    assert.equal(
      resolveRepairFnForIssue(
        issue({
          brain: 'Resident',
          code: 'MISSING_CURRENT_MONTH_RENT',
          autoRepairAvailable: true,
        }),
      ),
      'repairMissingRentInvoiceConservative',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({
          brain: 'Electricity',
          code: 'METER_LOG_WITHOUT_BILL',
          autoRepairAvailable: true,
          entityType: 'room',
        }),
      ),
      'repairMissingElectricityBillConservative',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({
          brain: 'Operations',
          code: 'INVALID_BILLING_MONTH',
          autoRepairAvailable: true,
        }),
      ),
      'cleanupSyntheticPaymentReviews',
    );
  });

  it('keeps invent-bills registry entry disabled', () => {
    const row = HEALTH_BRAIN_SAFE_REPAIRS.find((r) => r.id === 'repairMissingBills');
    assert.ok(row);
    assert.equal(row!.auto, false);
  });
});

describe('syntheticPollutionCleanup matcher', () => {
  it('matches sentinel + example + OPT markers, not legitimate months', () => {
    assert.equal(isSentinelBillingMonth('2099-01-01'), true);
    assert.equal(isSentinelBillingMonth('2026-08-01'), false);
    assert.equal(isExampleComProofUrl('https://example.com/x.png'), true);
    assert.equal(
      isExampleComProofUrl('https://abc.private.blob.vercel-storage.com/x.png'),
      false,
    );
    assert.equal(
      matchesSyntheticRentRow({
        billingMonth: '2099-01-01',
        invoiceNumber: 'OPTVERIFY_1',
        paymentProofUrl: 'https://example.com/a.png',
        isAdhoc: true,
      }),
      true,
    );
    assert.equal(
      matchesSyntheticRentRow({
        billingMonth: '2026-08-01',
        invoiceNumber: 'RNT-2026-08-0001',
        paymentProofUrl: 'https://abc.private.blob.vercel-storage.com/x.png',
        isAdhoc: false,
      }),
      false,
    );
  });
});
