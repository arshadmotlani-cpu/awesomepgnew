import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  evaluatePaymentReviewInvariants,
} from '@/src/lib/payments/paymentReviewInvariants';
import { HEALTH_BRAIN_SAFE_REPAIRS } from '@/src/lib/health/healthBrain';
import { logApprovalFlowTiming } from '@/src/lib/payments/paymentApprovalTiming';

describe('healthBrain wave1 wiring', () => {
  it('exports safe repair registry with missing-bills disabled', () => {
    const missingBills = HEALTH_BRAIN_SAFE_REPAIRS.find((r) => r.id === 'repairMissingBills');
    assert.ok(missingBills);
    assert.equal(missingBills!.auto, false);
    assert.ok(
      HEALTH_BRAIN_SAFE_REPAIRS.some((r) => r.id === 'repairOrphanReservesBlockingActiveStay' && r.auto),
    );
    assert.ok(
      HEALTH_BRAIN_SAFE_REPAIRS.some(
        (r) => r.id === 'repairStaleDraftReservesWithoutHold' && r.auto,
      ),
    );
  });

  it('healthBrain module exposes runAllBrainIntegrityAudits', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/health/healthBrain.ts'), 'utf8');
    assert.match(src, /export async function runAllBrainIntegrityAudits/);
    assert.match(src, /export type HealthIssue/);
    assert.match(src, /HealthBrainName/);
    assert.match(src, /'Resident'/);
    assert.match(src, /'Booking'/);
    assert.match(src, /'Finance'/);
  });

  it('system page mounts BrainIntegrityCards', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/system/page.tsx'),
      'utf8',
    );
    assert.match(src, /BrainIntegrityCards/);
    assert.match(src, /runAllBrainIntegrityAudits/);
  });

  it('health-report supports brain filter query', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/system/health-report/page.tsx'),
      'utf8',
    );
    assert.match(src, /brain\?: string/);
    assert.match(src, /brainFilter/);
  });

  it('cron health-brain-integrity route exists', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/cron/health-brain-integrity/route.ts'),
      'utf8',
    );
    assert.match(src, /runAllBrainIntegrityAudits/);
    assert.match(src, /runSafeRepairs:\s*true/);
  });
});

describe('payment approval timing helper', () => {
  it('logApprovalFlowTiming is exported and used by timer finish', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/payments/paymentApprovalTiming.ts'),
      'utf8',
    );
    assert.match(src, /export function logApprovalFlowTiming/);
    assert.match(src, /PAYMENT_APPROVAL_SLOW/);
    assert.equal(typeof logApprovalFlowTiming, 'function');
    // Under threshold — no throw
    logApprovalFlowTiming({
      label: 'test',
      steps: { total_ms: 10 },
    });
  });
});

describe('resident brain wave1 detections', () => {
  it('includes multi-stay and missing electricity codes', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/residents/residentBrainIntegrity.ts'),
      'utf8',
    );
    assert.match(src, /MULTIPLE_ACTIVE_PRIMARY_STAYS/);
    assert.match(src, /MISSING_ELECTRICITY_WINDOW/);
    assert.match(src, /repairOrphanReservesBlockingActiveStay/);
  });
});

describe('invariant regression anchors', () => {
  it('still rejects 2099, example.com, amount<=0, missing booking', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    const blob =
      'https://abc123.private.blob.vercel-storage.com/payment-proofs/rent/inv-1.png';
    assert.equal(
      evaluatePaymentReviewInvariants({
        kind: 'rent',
        invoiceId: 'i',
        customerId: 'c',
        bookingId: 'b',
        billingMonth: '2099-01-01',
        expectedAmountPaise: 100,
        paymentProofUrl: blob,
        now,
      }).ok,
      false,
    );
    assert.equal(
      evaluatePaymentReviewInvariants({
        kind: 'rent',
        invoiceId: 'i',
        customerId: 'c',
        bookingId: 'b',
        billingMonth: '2026-08-01',
        expectedAmountPaise: 100,
        paymentProofUrl: 'https://example.com/x.png',
        now,
      }).ok,
      false,
    );
    assert.equal(
      evaluatePaymentReviewInvariants({
        kind: 'rent',
        invoiceId: 'i',
        customerId: 'c',
        bookingId: 'b',
        billingMonth: '2026-08-01',
        expectedAmountPaise: 0,
        paymentProofUrl: blob,
        now,
      }).ok,
      false,
    );
    assert.equal(
      evaluatePaymentReviewInvariants({
        kind: 'rent',
        invoiceId: 'i',
        customerId: 'c',
        bookingId: null,
        billingMonth: '2026-08-01',
        expectedAmountPaise: 100,
        paymentProofUrl: blob,
        now,
      }).ok,
      false,
    );
  });
});
