import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutJourneyTimeline, wizardStepFromDetail } from '../../src/lib/checkout/checkoutJourneyTimeline';
import type { CheckoutSettlementDetail } from '../../src/services/checkoutSettlement';

function baseDetail(
  overrides: Partial<CheckoutSettlementDetail> = {},
): CheckoutSettlementDetail {
  return {
    id: 's1',
    status: 'awaiting_admin_review',
    customerName: 'Test',
    stayType: 'monthly',
    durationMode: 'monthly',
    electricityMeterPhotoUrl: 'https://example.com/m.jpg',
    payoutUpiId: 'test@upi',
    payoutQrUrl: null,
    meterPhotoMissing: false,
    electricityUseAverage: false,
    electricitySharePaise: 25000,
    electricityCalculationMethod: 'meter_reading',
    amountsLocked: false,
    refundReference: null,
    refundPaidAt: null,
    approvedAt: null,
    meterPhotoEvidence: { fetchable: true, viewUrl: '/x', storedUrl: '/x', status: 'present', statusLabel: 'Present' },
    refundQrEvidence: { fetchable: false, viewUrl: null, storedUrl: null, status: 'missing', statusLabel: 'Missing' },
    preview: {
      finalRefundPaise: 500000,
      noticeDeductionPaise: 0,
      electricityDeductionPaise: 25000,
      electricityDeductFromDeposit: true,
      electricitySharePaise: 25000,
      totalDeductionsPaise: 25000,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
    },
    depositRefundablePaise: 525000,
    creditBalancePaise: 0,
    ...overrides,
  } as CheckoutSettlementDetail;
}

test('journey timeline highlights electricity when resident submitted but bill not calculated', () => {
  const items = buildCheckoutJourneyTimeline(
    baseDetail({
      electricitySharePaise: 0,
      electricityCalculationMethod: 'meter_reading',
    }),
  );
  const current = items.find((i) => i.state === 'current');
  assert.equal(current?.id, 'electricity');
});

test('wizard opens on pay step when refund is pending', () => {
  assert.equal(wizardStepFromDetail(baseDetail({ status: 'refund_pending' })), 4);
});

test('journey timeline marks checkout complete when finished', () => {
  const items = buildCheckoutJourneyTimeline(
    baseDetail({
      status: 'completed',
      amountsLocked: true,
      refundPaidAt: new Date(),
      refundReference: '123',
    }),
  );
  assert.ok(items.every((i) => i.state === 'done'));
});
