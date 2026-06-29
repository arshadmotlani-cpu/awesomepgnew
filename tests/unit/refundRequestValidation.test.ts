import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getDepositRefundEligibility } from '../../src/lib/vacating/depositRefundEligibility';
import { buildRefundRequestPageModel } from '../../src/lib/refund/refundRequestValidation';

const baseVacating = {
  id: 'v1',
  bookingId: 'b1',
  noticeGivenDate: '2026-06-01T00:00:00.000Z',
  vacatingDate: '2026-06-15T00:00:00.000Z',
  noticeCompliant: true,
  deductionPaise: 0,
  depositRefundPaise: 0,
  monthlyRentPaiseSnapshot: 100_000,
  status: 'approved' as const,
  notes: null,
  resolvedAt: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
};

test('getDepositRefundEligibility tolerates ISO timestamp vacating dates from client serialization', () => {
  const result = getDepositRefundEligibility({
    vacating: baseVacating,
    today: '2026-06-10',
  });
  assert.equal(result.canRequestRefund, false);
  assert.match(result.lockReason ?? '', /approved move-out date/i);
});

test('buildRefundRequestPageModel never throws for fixed-stay with ISO booking createdAt', () => {
  const model = buildRefundRequestPageModel({
    booking: {
      bookingId: 'bk-fixed',
      bookingCode: 'APG-1',
      status: 'confirmed',
      durationMode: 'fixed_stay',
      expectedCheckoutDate: '2026-06-20',
      createdAt: '2026-05-01T10:00:00.000Z',
      refundableBalancePaise: 50_000,
      monthlyRentPaise: 0,
    },
    vacating: null,
    settlement: null,
  });
  assert.equal(model.stayKind, 'fixed_stay');
  assert.equal(model.canRenderForm, true);
});

test('buildRefundRequestPageModel blocks monthly refund when booking id missing', () => {
  const model = buildRefundRequestPageModel({
    booking: {
      bookingId: '',
      status: 'confirmed',
      durationMode: 'monthly',
      createdAt: '2026-01-01T00:00:00.000Z',
      refundableBalancePaise: 10_000,
    },
    vacating: baseVacating,
    settlement: { status: 'awaiting_resident_details', rejectionReason: 'Blurry meter photo' },
  });
  assert.equal(model.canRenderForm, false);
  assert.ok(model.missingRequirements.includes('booking'));
});

test('buildRefundRequestPageModel allows resubmit after settlement rejection', () => {
  const model = buildRefundRequestPageModel({
    booking: {
      bookingId: 'bk-1',
      status: 'confirmed',
      durationMode: 'monthly',
      createdAt: '2026-01-01T00:00:00.000Z',
      refundableBalancePaise: 100_000,
      monthlyRentPaise: 30_000,
    },
    vacating: { ...baseVacating, vacatingDate: '2020-06-01', noticeGivenDate: '2020-05-10' },
    settlement: { status: 'awaiting_resident_details', rejectionReason: 'Wrong QR code' },
  });
  assert.equal(model.canRenderForm, true);
  assert.equal(model.rejectionReason, 'Wrong QR code');
});
