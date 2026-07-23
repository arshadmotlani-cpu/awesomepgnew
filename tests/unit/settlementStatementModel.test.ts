import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { PENDING_DAMAGES_LABEL, PENDING_ELECTRICITY_LABEL } from '../../src/lib/checkout/settlementDisplayFormat';
import { buildFallbackPgLetterhead } from '../../src/lib/billing/pgLetterheadFallback';
import {
  estimatedSettlementFromCheckoutWaterfall,
} from '../../src/lib/vacating/estimatedSettlementPreview';
import { buildSettlementStatementModel } from '../../src/lib/vacating/settlementStatementModel';

function kunalLikeWaterfall() {
  return computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
}

test('buildSettlementStatementModel maps summary KPIs from waterfall', () => {
  const waterfall = kunalLikeWaterfall();
  const preview = estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: 'bk-1',
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      monthlyRentPaiseSnapshot: 150_000,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 14,
      noticeDeductionPaise: 0,
      depositRefundablePaise: 412_100,
      preview: { electricityDeductionPaise: 0 },
      approvalBaselineLocked: true,
      amountsLocked: false,
    },
    waterfall,
  });

  const document = buildSettlementStatementModel({
    preview,
    vacatingRequestId: 'vac-12345678-abcd',
    bookingId: 'bk-1',
    customerName: 'Test Resident',
    customerPhone: '9999999999',
    bookingCode: 'BK-001',
    pgName: 'Awesome PG',
    roomNumber: '203',
    bedCode: 'B5',
    noticeGivenDate: '2026-07-21',
    vacatingDate: '2026-07-21',
    letterhead: buildFallbackPgLetterhead('Awesome PG'),
  });

  assert.equal(document.mode, 'baseline');
  assert.equal(document.statementNumber, 'EST-VAC-1234');
  assert.equal(document.summaryKpis.length, 5);

  const refundKpi = document.summaryKpis.find((k) => k.id === 'estimated_refund');
  assert.ok(refundKpi);
  assert.match(refundKpi!.value, /₹/);

  const depositKpi = document.summaryKpis.find((k) => k.id === 'deposit_held');
  assert.ok(depositKpi);
  assert.match(depositKpi!.value, /₹4,121/);

  const pendingKpi = document.summaryKpis.find((k) => k.id === 'pending_charges');
  assert.ok(pendingKpi);
  assert.match(pendingKpi!.value, new RegExp(PENDING_ELECTRICITY_LABEL));
  assert.match(pendingKpi!.value, new RegExp(PENDING_DAMAGES_LABEL));
  assert.equal(pendingKpi!.tone, 'pending');

  assert.ok(document.lineItems.length > 0);
  assert.equal(document.estimatedRefundPaise, preview.estimatedRefundPaise);
});

test('buildSettlementStatementModel uses final mode label when amounts locked', () => {
  const waterfall = kunalLikeWaterfall();
  const preview = estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: 'bk-1',
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      monthlyRentPaiseSnapshot: 150_000,
      depositRefundablePaise: 412_100,
      preview: { electricityDeductionPaise: 0 },
      approvalBaselineLocked: true,
      amountsLocked: true,
    },
    waterfall,
  });

  const document = buildSettlementStatementModel({
    preview,
    vacatingRequestId: 'vac-final-test',
    bookingId: 'bk-1',
    customerName: 'Resident',
    customerPhone: '—',
    bookingCode: 'BK-001',
    pgName: 'Awesome PG',
    roomNumber: '1',
    bedCode: 'A1',
    noticeGivenDate: '2026-07-21',
    vacatingDate: '2026-07-21',
    letterhead: buildFallbackPgLetterhead('Awesome PG'),
  });

  assert.equal(document.modeLabel, 'Final Settlement Statement');
  const refundKpi = document.summaryKpis.find((k) => k.id === 'estimated_refund');
  assert.equal(refundKpi?.label, 'Final refund');
});
