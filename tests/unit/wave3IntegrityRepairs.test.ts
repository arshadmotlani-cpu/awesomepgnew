import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeHealthScore, resolveRepairFnForIssue } from '@/src/lib/health/repairEngine';
import type { HealthIssue } from '@/src/lib/health/healthBrain';
import { HEALTH_BRAIN_SAFE_REPAIRS } from '@/src/lib/health/healthBrain';

function issue(partial: Partial<HealthIssue> & Pick<HealthIssue, 'code' | 'brain'>): HealthIssue {
  return {
    id: 'x',
    severity: 'P1',
    entityType: 'customer',
    entityId: 'c1',
    cause: 'test',
    suggestedRepair: 'test',
    autoRepairAvailable: true,
    status: 'repair_available',
    ...partial,
  };
}

describe('wave3 health score + repairs', () => {
  it('returns 100 only when every brain is healthy', () => {
    assert.equal(computeHealthScore([]), 100);
    const withDrift = [
      issue({ brain: 'Resident', code: 'ACTIVE_RESIDENCY_WITHOUT_TENANCY', severity: 'P1' }),
    ];
    const score = computeHealthScore(withDrift);
    assert.ok(score < 100);
    assert.ok(score <= 99);
  });

  it('resolves wave3 repair fns', () => {
    assert.equal(
      resolveRepairFnForIssue(
        issue({ brain: 'Resident', code: 'DRAFT_BOOKING_WITH_ACTIVE_STAY' }),
      ),
      'repairAbandonedDraftsWithActiveStay',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({ brain: 'Resident', code: 'ACTIVE_RESIDENCY_WITHOUT_TENANCY' }),
      ),
      'repairResidencyTenancyDrift',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({ brain: 'Resident', code: 'TENANCY_WITHOUT_ACTIVE_RESIDENCY' }),
      ),
      'repairResidencyTenancyDrift',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({ brain: 'Finance', code: 'PAYMENT_WITHOUT_INVOICE' }),
      ),
      'repairUnambiguousOrphanRentPaymentLinks',
    );
    assert.equal(
      resolveRepairFnForIssue(
        issue({
          brain: 'Booking',
          code: 'CONFIRMED_WITHOUT_BED',
          entityType: 'booking',
          entityId: 'b1',
        }),
      ),
      'repairEndedConfirmedFixedStayBookings',
    );
  });

  it('registers wave3 safe repairs as auto', () => {
    for (const id of [
      'repairAbandonedDraftsWithActiveStay',
      'repairResidencyTenancyDrift',
      'repairUnambiguousOrphanRentPaymentLinks',
      'repairEndedConfirmedFixedStayBookings',
    ] as const) {
      const row = HEALTH_BRAIN_SAFE_REPAIRS.find((r) => r.id === id);
      assert.ok(row, id);
      assert.equal(row!.auto, true);
    }
  });
});
