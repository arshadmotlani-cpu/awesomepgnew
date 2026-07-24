import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { buildFallbackPgLetterhead } from '../../src/lib/billing/pgLetterheadFallback';
import { estimatedSettlementFromCheckoutWaterfall } from '../../src/lib/vacating/estimatedSettlementPreview';
import { buildSettlementStatementModel } from '../../src/lib/vacating/settlementStatementModel';
import {
  applySettlementPresentationAudience,
  audienceFromFinancialSurface,
  plainNoticeStatus,
  visibleSectionIds,
} from '../../src/lib/vacating/settlementPresentationAudience';

function sampleDocument() {
  const waterfall = computeCheckoutSettlementV2({
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
  return buildSettlementStatementModel({
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
}

test('audienceFromFinancialSurface maps surfaces', () => {
  assert.equal(audienceFromFinancialSurface('resident'), 'resident');
  assert.equal(audienceFromFinancialSurface('adminModal'), 'adminReview');
  assert.equal(audienceFromFinancialSurface('adminPage'), 'accountant');
});

test('accountant view keeps full sections', () => {
  const model = sampleDocument();
  const view = applySettlementPresentationAudience(model, 'accountant');
  assert.equal(view.showAuditTrace, model.auditTrace.length > 0 || view.showAuditTrace);
  assert.ok(view.showRentSummary);
  assert.ok(view.collapsedSections.length > 0);
  assert.equal(view.affectsRefundSection, null);
  const ids = visibleSectionIds(view);
  assert.ok(ids.includes('rent_summary'));
  assert.ok(view.collapsedSections.some((s) => ids.includes(s.id)));
});

test('resident view hides engine sections from default visibility', () => {
  const model = sampleDocument();
  const view = applySettlementPresentationAudience(model, 'resident');
  assert.equal(view.heroMetrics.length, 1);
  assert.equal(view.heroMetrics[0]?.large, true);
  assert.equal(view.rentSummary.rows.length, 0);
  assert.equal(view.collapsedSections.length, 0);
  assert.equal(view.auditTrace.length, 0);
  assert.equal(view.explanations, null);
  assert.equal(view.showUnusedRentCreditFooter, false);
  const ids = visibleSectionIds(view);
  assert.ok(!ids.includes('rent_summary'));
  assert.ok(!ids.includes('audit_trace'));
});

test('adminReview view is minimal like resident without affects collapsible', () => {
  const model = sampleDocument();
  const view = applySettlementPresentationAudience(model, 'adminReview');
  assert.equal(view.affectsRefundSection, null);
  assert.equal(view.showDecisionHero, true);
  assert.equal(view.collapsedSections.length, 0);
});

test('plainNoticeStatus', () => {
  assert.equal(plainNoticeStatus({ noticeCompletedDays: 30, noticeRequiredDays: 30 }).tone, 'compliant');
  assert.equal(plainNoticeStatus({ noticeCompletedDays: 10, noticeRequiredDays: 30 }).tone, 'short');
});
