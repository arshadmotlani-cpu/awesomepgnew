import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResidentMoveOutSettlementStory,
  kunalShapedStoryFixtureWaterfall,
  RESIDENT_STORY_FORBIDDEN_COPY,
  RESIDENT_STORY_LABELS,
} from '@/src/lib/residents/residentMoveOutSettlementStory';

test('Kunal-shaped story: money flow order and deposit refund', () => {
  const waterfall = kunalShapedStoryFixtureWaterfall();
  const story = buildResidentMoveOutSettlementStory({
    noticeGivenDate: '2026-07-21',
    vacatingDate: '2026-07-21',
    vacatingStatus: 'approved',
    depositHeldPaise: 412_100,
    monthlyRentPaiseSnapshot: 412_100,
    waterfall,
    mode: 'estimate',
    deductionPaise: 192_300,
  });

  assert.ok(story);
  assert.equal(story.payments.monthlyRentPaise, 412_100);
  assert.equal(story.payments.securityDepositPaise, 412_100);
  assert.equal(story.payments.totalPaidPaise, 824_200);

  const labels = story.moneyFlowSteps.map((s) => s.label);
  assert.deepEqual(labels, [
    RESIDENT_STORY_LABELS.rentUsed,
    RESIDENT_STORY_LABELS.unusedRentBalance,
    RESIDENT_STORY_LABELS.noticePolicyCharge,
    RESIDENT_STORY_LABELS.paidUsingUnusedRent,
    RESIDENT_STORY_LABELS.remainingNoticeCharge,
    RESIDENT_STORY_LABELS.takenFromSecurityDeposit,
  ]);

  assert.equal(story.moneyFlowSteps[0]?.amountPaise, 247_200);
  assert.equal(story.moneyFlowSteps[1]?.amountPaise, 164_800);
  assert.equal(story.moneyFlowSteps[2]?.amountPaise, 192_300);
  assert.equal(story.moneyFlowSteps[3]?.amountPaise, 164_800);
  assert.equal(story.moneyFlowSteps[5]?.amountPaise, 27_500);

  assert.equal(story.deposit.remainingPaise, 384_600);
  assert.equal(story.refund.expectedDepositRefundPaise, 384_600);
  assert.equal(story.refund.showApproxPrefix, true);
  assert.equal(story.moveOutDetails.badge, 'short');
  assert.equal(story.moveOutDetails.noticeShortDays, 14);
});

test('compliant notice: green badge and no notice charge flow', () => {
  const waterfall = kunalShapedStoryFixtureWaterfall();
  waterfall.notice = {
    missingNoticeDays: 0,
    fullPaise: 0,
    fromUnusedRentPaise: 0,
    fromDepositPaise: 0,
    unusedRentRemainingPaise: waterfall.rentBucket.unusedPaise,
  };
  waterfall.depositBucket.refundablePaise = 412_100;

  const story = buildResidentMoveOutSettlementStory({
    noticeGivenDate: '2026-07-01',
    vacatingDate: '2026-07-21',
    vacatingStatus: 'approved',
    depositHeldPaise: 412_100,
    waterfall,
    mode: 'final',
  });

  assert.ok(story);
  assert.equal(story.moveOutDetails.badge, 'compliant');
  assert.ok(story.moneyFlowSteps.some((s) => s.label === RESIDENT_STORY_LABELS.noNoticePolicyCharge));
});

test('surface copy excludes forbidden accounting terms', () => {
  const story = buildResidentMoveOutSettlementStory({
    noticeGivenDate: '2026-07-21',
    vacatingDate: '2026-07-21',
    vacatingStatus: 'pending',
    depositHeldPaise: 412_100,
    waterfall: kunalShapedStoryFixtureWaterfall(),
    mode: 'estimate',
  });
  assert.ok(story);
  const blob = JSON.stringify(story);
  for (const term of RESIDENT_STORY_FORBIDDEN_COPY) {
    assert.doesNotMatch(blob, new RegExp(term, 'i'), `forbidden term leaked: ${term}`);
  }
});

test('returns null without waterfall', () => {
  assert.equal(
    buildResidentMoveOutSettlementStory({
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      vacatingStatus: 'approved',
      depositHeldPaise: 0,
      waterfall: null,
    }),
    null,
  );
});
