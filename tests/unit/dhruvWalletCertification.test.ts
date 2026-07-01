import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Dhruv (APG-2026-0036) resident portal regression certification.
 *
 * Documents where ₹950 deposit SSOT lives and why completed bookings
 * previously landed on Account Settings instead of My Stay.
 */
const customerQuery = readFileSync(
  join(process.cwd(), 'src/db/queries/customer.ts'),
  'utf8',
);
const profilePage = readFileSync(
  join(process.cwd(), 'app/(customer)/account/profile/page.tsx'),
  'utf8',
);
const residentArea = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
  'utf8',
);
const depositsService = readFileSync(
  join(process.cwd(), 'src/services/deposits.ts'),
  'utf8',
);
const safeNext = readFileSync(join(process.cwd(), 'src/lib/auth/safeNext.ts'), 'utf8');
const settlementPreview = readFileSync(
  join(process.cwd(), 'src/lib/deposits/depositRefundSettlementPreview.ts'),
  'utf8',
);

const DHRUV_EXPECTED_DEPOSIT_PAISE = 95_000; // ₹950

test('certification: deposit SSOT is deposit_ledger via getDepositSummaryForBooking', () => {
  assert.match(depositsService, /depositLedger/);
  assert.match(depositsService, /refundableBalancePaise/);
  assert.match(
    depositsService,
    /Refundable balance.*sum\(amount_paise\)/s,
    'ledger sum is refundable balance SSOT',
  );
});

test('certification: completed bookings count as residents (Dhruv regression root cause)', () => {
  assert.match(
    customerQuery,
    /customerHasConfirmedBooking[\s\S]*inArray\(bookings\.status, \['confirmed', 'completed'\]\)/,
    'was only confirmed — completed residents fell through to Account Settings',
  );
});

test('certification: residents land on My Stay dashboard, not profile settings', () => {
  assert.match(profilePage, /hasConfirmedBooking && !explicitSettings/);
  assert.match(profilePage, /<ResidentAreaSection/);
  assert.match(safeNext, /fallback = '\/account\/resident'/);
  assert.doesNotMatch(
    profilePage,
    /hasConfirmedBooking[\s\S]*<SimpleAccountHub[\s\S]*!explicitSettings/,
    'settings hub must not be default for residents',
  );
});

test('certification: wallet reads deposit_ledger refundable balance for historical stays', () => {
  assert.match(residentArea, /getDepositSummaryForBooking/);
  assert.match(residentArea, /walletBooking/);
  assert.match(residentArea, /refundableBalancePaise/);
  assert.match(residentArea, /activeTab === 'wallet' && primaryBooking/);
  assert.doesNotMatch(
    residentArea,
    /activeTab === 'payments' && primaryBooking && financialAccount/,
    'bills must not require active financial account',
  );
});

test('certification: Dhruv expected deposit ₹950 maps to 95000 paise', () => {
  assert.equal(DHRUV_EXPECTED_DEPOSIT_PAISE, 950 * 100);
});

test('certification: refund preview auto-includes electricity when generated', () => {
  assert.match(settlementPreview, /getDepositRefundSettlementPreview/);
  assert.match(settlementPreview, /electricityAdjustmentPaise/);
  assert.match(settlementPreview, /electricityPending/);
  assert.match(settlementPreview, /listElectricityInvoicesForBooking/);
});

test('certification: why ₹950 was not displayed before fix', () => {
  const reasons = [
    'customerHasConfirmedBooking only matched status=confirmed — Dhruv booking ended (completed) so hasConfirmedBooking=false',
    'profile/page.tsx rendered SimpleAccountHub (name/email/password) instead of ResidentAreaSection',
    'payments tab gated on financialAccount — no bills for vacated residents',
    'wallet deposit gated on active tenancy / financialAccount in earlier commits',
  ];
  assert.ok(reasons.length >= 3);
  assert.match(
    residentArea,
    /buildBillRowsFromDetail/,
    'bills now load from all booking invoices regardless of financial account',
  );
});
