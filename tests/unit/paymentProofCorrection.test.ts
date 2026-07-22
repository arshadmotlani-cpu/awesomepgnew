import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { sanitizeAuditDiff } from '@/src/lib/audit/writeAuditLog';
import { normalizePaymentProofAllocation } from '@/src/services/paymentProofCorrection';

describe('paymentProofCorrection', () => {
  test('normalizePaymentProofAllocation coerces optional splits to zero', () => {
    const normalized = normalizePaymentProofAllocation({
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_100,
      depositAllocatedPaise: 205_900,
    });

    assert.equal(normalized.electricityAllocatedPaise, 0);
    assert.equal(normalized.otherAllocatedPaise, 0);
    assert.equal(
      normalized.rentAllocatedPaise + normalized.depositAllocatedPaise,
      normalized.confirmedReceivedPaise,
    );
  });

  test('normalizePaymentProofAllocation coerces bigint paise from postgres', () => {
    const normalized = normalizePaymentProofAllocation({
      confirmedReceivedPaise: 618_000n as unknown as number,
      rentAllocatedPaise: 412_100n as unknown as number,
      depositAllocatedPaise: 205_900n as unknown as number,
      electricityAllocatedPaise: undefined,
      otherAllocatedPaise: undefined,
    });

    assert.equal(normalized.confirmedReceivedPaise, 618_000);
    assert.equal(normalized.rentAllocatedPaise, 412_100);
    assert.equal(normalized.depositAllocatedPaise, 205_900);
  });

  test('audit diff for proof correction survives bigint paise values', () => {
    const diff = sanitizeAuditDiff({
      bookingId: 'booking-1',
      previousAmountPaise: 1_236_200n,
      verifiedAmountPaise: 618_000,
      previousSubmittedPaise: null,
      reason: 'Admin verified screenshot amount',
    }) as Record<string, unknown>;

    assert.equal(diff.previousAmountPaise, 1_236_200);
    assert.equal(diff.verifiedAmountPaise, 618_000);
  });

  test('correctPendingPaymentProofAmount uses transaction + read-back verification', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/paymentProofCorrection.ts'),
      'utf8',
    );

    assert.match(src, /db\.transaction\(async \(tx\)/);
    assert.match(src, /readBackCorrectedProofAmount/);
    assert.match(src, /writeAuditLogNonBlocking/);
    assert.doesNotMatch(src, /db\.insert\(auditLog\)/);
  });
});
