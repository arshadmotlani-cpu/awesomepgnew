import { strict as assert } from 'node:assert';
import test from 'node:test';
import { buildMoveOutPipeline, type MoveOutPipelineItem } from '../../src/lib/moveOut/moveOutPipeline';
import { computeMoveOutPipelineCounts } from '../../src/lib/moveOut/moveOutPipelineCounts';

const baseVacating = {
  bookingId: 'bk-1',
  bookingCode: 'APG-1',
  customerId: 'c-1',
  customerFullName: 'Resident One',
  customerPhone: '+910000000000',
  pgName: 'Shantinagar',
  bedCode: 'B1',
  roomNumber: '101',
  noticeGivenDate: '2026-06-01',
  noticeCompliant: true,
  resolvedAt: null,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  deductionPaise: 0,
  depositHeldPaise: 0,
};

test('computeMoveOutPipelineCounts excludes completed checkout pipeline rows', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-active',
        vacatingDate: '2026-07-01',
        status: 'pending',
      },
      {
        ...baseVacating,
        id: 'vr-done',
        vacatingDate: '2026-06-01',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-done',
        vacatingRequestId: 'vr-done',
        status: 'completed',
        createdAt: new Date('2026-06-02'),
        updatedAt: new Date('2026-06-03'),
        approvedAt: new Date('2026-06-03'),
        refundPaidAt: null,
      },
    ],
  });

  const counts = computeMoveOutPipelineCounts(pipeline.filter((i) => i.stage !== 'bed_released'), '2026-06-12');
  assert.equal(counts.moveOutNotices, 1);
});

test('computeMoveOutPipelineCounts applies 30-day beds releasing window', () => {
  const active: MoveOutPipelineItem[] = [
    {
      ...baseVacating,
      id: 'vr-near',
      vacatingRequestId: 'vr-near',
      vacatingDate: '2026-06-20',
      vacatingStatus: 'approved',
      settlementId: null,
      settlementStatus: null,
      stage: 'notice_verified',
      stageIndex: 1,
      stageLabel: 'Notice verified',
      nextAction: 'Continue',
      continueHref: null,
      continueKind: 'settlement',
      sortPriority: 3,
      daysRemaining: 8,
      urgency: 'normal',
      bedStatus: 'Scheduled for Release',
      stageTimestamps: {},
      electricityDeductionPaise: 0,
      estimatedRefundPaise: 0,
    },
    {
      ...baseVacating,
      id: 'vr-far',
      vacatingRequestId: 'vr-far',
      vacatingDate: '2026-09-01',
      vacatingStatus: 'approved',
      settlementId: null,
      settlementStatus: null,
      stage: 'notice_verified',
      stageIndex: 1,
      stageLabel: 'Notice verified',
      nextAction: 'Continue',
      continueHref: null,
      continueKind: 'settlement',
      sortPriority: 3,
      daysRemaining: 80,
      urgency: 'normal',
      bedStatus: 'Scheduled for Release',
      stageTimestamps: {},
      electricityDeductionPaise: 0,
      estimatedRefundPaise: 0,
    },
  ];

  const counts = computeMoveOutPipelineCounts(active, '2026-06-12');
  assert.equal(counts.moveOutNotices, 2);
  assert.equal(counts.bedsReleasing30Days, 1);
});
