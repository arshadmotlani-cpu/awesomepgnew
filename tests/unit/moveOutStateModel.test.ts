import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeDateChangeFinancialImpact,
  enrichVacatingDateChangePreview,
} from '../../src/lib/vacating/moveOutStateModel';
import type { CheckoutSettlementWaterfall } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { isNoticeCompliant } from '../../src/services/billing';

function emptyWaterfall(refundTotal = 100_000, unusedRent = 0, consumed = 50_000): CheckoutSettlementWaterfall {
  return {
    stay: { stayDays: 10, periodStart: '2026-08-01', periodEnd: '2026-08-10' },
    rentBucket: {
      paidPaise: consumed + unusedRent,
      consumedPaise: consumed,
      unusedPaise: unusedRent,
      dailyRentPaise: 5000,
      periodDailyRentPaise: 5000,
    },
    notice: { missingNoticeDays: 0, fromDepositPaise: 0, fromUnusedRentPaise: 0, fullPaise: 0 },
    depositBucket: {
      collectedPaise: 200_000,
      electricityPaise: 0,
      otherPaise: 0,
      tailRentPaise: 0,
    },
    refund: {
      unusedRentPortionPaise: unusedRent,
      depositPortionPaise: refundTotal - unusedRent,
      totalPaise: refundTotal,
    },
  } as CheckoutSettlementWaterfall;
}

function previewStub(
  currentDate: string,
  requestedDate: string,
  currentRefund: number,
  requestedRefund: number,
  currentW: CheckoutSettlementWaterfall,
  requestedW: CheckoutSettlementWaterfall,
) {
  return {
    currentVacatingDate: currentDate,
    requestedVacatingDate: requestedDate,
    noticeCompliant: true,
    currentEstimatedSettlement: {
      waterfall: currentW,
      estimatedRefundPaise: currentRefund,
      estimatedUnusedRentCreditPaise: 0,
      estimatedRefundableDepositPaise: currentRefund,
      depositHeldPaise: 200_000,
      sections: [],
      auditTrace: [],
      disclaimer: '',
      mode: 'estimate' as const,
    },
    requestedEstimatedSettlement: {
      waterfall: requestedW,
      estimatedRefundPaise: requestedRefund,
      estimatedUnusedRentCreditPaise: 0,
      estimatedRefundableDepositPaise: requestedRefund,
      depositHeldPaise: 200_000,
      sections: [],
      auditTrace: [],
      disclaimer: '',
      mode: 'estimate' as const,
    },
    currentEstimatedRefundPaise: currentRefund,
    requestedEstimatedRefundPaise: requestedRefund,
    refundDeltaPaise: requestedRefund - currentRefund,
    refundDeltaLabel: 'test',
  };
}

describe('moveOutStateModel — date change financial impact', () => {
  test('earlier date: unused prepaid rent from requested waterfall', () => {
    const preview = previewStub(
      '2026-08-20',
      '2026-08-15',
      150_000,
      180_000,
      emptyWaterfall(150_000, 0, 80_000),
      emptyWaterfall(180_000, 30_000, 50_000),
    );
    const impact = computeDateChangeFinancialImpact(preview);
    assert.equal(impact.direction, 'earlier');
    assert.equal(impact.unusedPrepaidRentPaise, 30_000);
    assert.equal(impact.additionalStayDays, 0);
    assert.equal(impact.additionalRentPaise, 0);
  });

  test('later date: additional stay days and rent delta', () => {
    const preview = previewStub(
      '2026-08-20',
      '2026-08-25',
      180_000,
      150_000,
      emptyWaterfall(180_000, 20_000, 60_000),
      emptyWaterfall(150_000, 0, 90_000),
    );
    const impact = computeDateChangeFinancialImpact(preview);
    assert.equal(impact.direction, 'later');
    assert.equal(impact.additionalStayDays, 5);
    assert.ok(impact.additionalRentPaise > 0);
  });

  test('enrich preview adds notice fields without changing compliance', () => {
    const base = previewStub(
      '2026-08-20',
      '2026-08-15',
      150_000,
      180_000,
      emptyWaterfall(150_000),
      emptyWaterfall(180_000, 25_000),
    );
    const enriched = enrichVacatingDateChangePreview(base, {
      noticeGivenDate: '2026-07-23',
      originalNoticeSubmittedAt: '2026-07-23T10:00:00.000Z',
      originalVacatingDate: '2026-08-20',
    });
    assert.equal(enriched.noticeGivenDate, '2026-07-23');
    assert.equal(enriched.direction, 'earlier');
    assert.match(enriched.noticeComplianceLabel ?? '', /satisfied/i);
  });
});

describe('notice compliance — uses notice_given_date not date change time', () => {
  test('23 Jul notice to 15 Aug is compliant (scenario A)', () => {
    assert.equal(
      isNoticeCompliant({ noticeGivenDate: '2026-07-23', vacatingDate: '2026-08-15' }),
      true,
    );
  });

  test('23 Jul notice to 25 Jul is not compliant (scenario C)', () => {
    assert.equal(
      isNoticeCompliant({ noticeGivenDate: '2026-07-23', vacatingDate: '2026-07-25' }),
      false,
    );
  });
});
