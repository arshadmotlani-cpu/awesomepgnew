/**
 * Room OS Wave 6 — workflow state machine and review key tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  buildPaymentProofReviewKey,
  parsePaymentProofReviewKey,
} from '@/src/roomOs/workflow/resolveReviewKey';
import {
  assertPaymentProofTransition,
  canTransitionPaymentProofWorkflow,
  initialPaymentProofWorkflowState,
} from '@/src/roomOs/workflow/stateMachine';

describe('Room OS Wave 6 — Workflow', () => {
  test('review key round-trip for all proof kinds', () => {
    const cases = [
      { kind: 'qr' as const, id: 'a1', key: 'qr-a1' },
      { kind: 'rent' as const, id: 'b2', key: 'rent-b2' },
      { kind: 'electricity' as const, id: 'c3', key: 'elec-c3' },
      { kind: 'extension' as const, id: 'd4', key: 'ext-d4' },
      { kind: 'deposit_link' as const, id: 'e5', key: 'deposit-link-e5' },
    ];
    for (const c of cases) {
      assert.equal(buildPaymentProofReviewKey(c.kind, c.id), c.key);
      const parsed = parsePaymentProofReviewKey(c.key);
      assert.ok(parsed);
      assert.equal(parsed!.entityKind, c.kind);
      assert.equal(parsed!.entityId, c.id);
    }
  });

  test('state machine allows submit → review → approve/reject path', () => {
    assert.equal(initialPaymentProofWorkflowState(), 'submitted');
    assert.equal(canTransitionPaymentProofWorkflow('submitted', 'under_review'), true);
    assert.equal(canTransitionPaymentProofWorkflow('under_review', 'approved'), true);
    assert.equal(canTransitionPaymentProofWorkflow('under_review', 'rejected'), true);
    assert.equal(canTransitionPaymentProofWorkflow('approved', 'rejected'), false);
    assert.doesNotThrow(() => assertPaymentProofTransition('submitted', 'under_review'));
  });

  test('state machine allows rejected → under_review but not rejected → approved', () => {
    assert.equal(canTransitionPaymentProofWorkflow('rejected', 'under_review'), true);
    assert.equal(canTransitionPaymentProofWorkflow('rejected', 'approved'), false);
    assert.doesNotThrow(() => assertPaymentProofTransition('rejected', 'under_review'));
    assert.throws(
      () => assertPaymentProofTransition('rejected', 'approved'),
      /Invalid payment proof workflow transition: rejected → approved/,
    );
  });

  test('state machine blocks submitted → rejected without under_review', () => {
    assert.equal(canTransitionPaymentProofWorkflow('submitted', 'rejected'), false);
    assert.throws(
      () => assertPaymentProofTransition('submitted', 'rejected'),
      /Invalid payment proof workflow transition: submitted → rejected/,
    );
  });

  test('reject orchestration submits review before payment when not under_review', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/orchestrate/rejectPaymentProof.ts'),
      'utf8',
    );
    assert.match(src, /existing\?\.currentState !== 'under_review'/);
    assert.match(src, /await submitPaymentProofReview\(/);
    assert.match(src, /await rejectPaymentProof\(/);
    const submitIdx = src.indexOf('submitPaymentProofReview');
    const paymentIdx = src.indexOf('rejectPaymentProof');
    assert.ok(submitIdx >= 0 && paymentIdx > submitIdx);
  });

  test('reject orchestration returns structured error when post-payment transition fails', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/orchestrate/rejectPaymentProof.ts'),
      'utf8',
    );
    assert.match(src, /transitionResult = await transitionPaymentProofWorkflow\(/);
    assert.match(
      src,
      /Payment proof was rejected but workflow state could not be updated\. Reconcile manually\./,
    );
  });

  test('transition workflow serializes with FOR UPDATE lock', () => {
    const transitionSrc = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/store/transitionWorkflow.ts'),
      'utf8',
    );
    const loadSrc = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/store/loadInstance.ts'),
      'utf8',
    );
    assert.match(transitionSrc, /db\.transaction/);
    assert.match(transitionSrc, /loadWorkflowInstanceByReviewKeyForUpdate/);
    assert.match(loadSrc, /\.for\('update'\)/);
  });

  test('approve orchestration submits review before payment when not under_review', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/orchestrate/approvePaymentProof.ts'),
      'utf8',
    );
    assert.match(src, /existing\?\.currentState !== 'under_review'/);
    assert.match(src, /await submitPaymentProofReview\(/);
    assert.match(src, /await approvePaymentProofWithAllocation\(/);
    const submitIdx = src.indexOf('submitPaymentProofReview');
    const paymentIdx = src.indexOf('approvePaymentProofWithAllocation');
    assert.ok(submitIdx >= 0 && paymentIdx > submitIdx);
  });

  test('approve orchestration returns structured error when post-payment transition fails', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/orchestrate/approvePaymentProof.ts'),
      'utf8',
    );
    assert.match(src, /transitionResult = await transitionPaymentProofWorkflow\(/);
    assert.match(
      src,
      /Payment was approved but workflow state could not be updated\. Reconcile manually\./,
    );
    assert.match(src, /return \{\s*ok: false,\s*message:/);
  });

  test('workflow outbox event types registered in catalog', async () => {
    const { ROOM_OS_EVENT_TYPES } = await import('@/src/roomOs/events/catalog');
    assert.ok(ROOM_OS_EVENT_TYPES.includes('workflow.payment_proof.submitted'));
    assert.ok(ROOM_OS_EVENT_TYPES.includes('workflow.payment_proof.approved'));
    assert.ok(ROOM_OS_EVENT_TYPES.includes('workflow.payment_proof.rejected'));
  });
});
