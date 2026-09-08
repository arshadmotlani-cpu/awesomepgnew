import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const portalAccess = readFileSync(
  join(process.cwd(), 'src/lib/residents/residentPortalAccess.ts'),
  'utf8',
);
const vacating = readFileSync(join(process.cwd(), 'src/services/vacating.ts'), 'utf8');
const profilePage = readFileSync(
  join(process.cwd(), 'app/(customer)/account/profile/page.tsx'),
  'utf8',
);
const residentPage = readFileSync(
  join(process.cwd(), 'app/(customer)/account/resident/page.tsx'),
  'utf8',
);

test('portal access: checkout limbo confirmed booking unlocks resident hub', () => {
  assert.match(portalAccess, /customerHasCheckoutLimboPortalAccess/);
  assert.match(portalAccess, /inArray\(bedReservations\.status, \['active', 'hold'\]\)/);
  assert.match(portalAccess, /customerHasCheckoutLimboPortalAccess\(customerId\)/);
});

test('portal access: completed stay unlocks historical resident portal', () => {
  assert.match(portalAccess, /customerHasCompletedStayPortalAccess/);
  assert.match(portalAccess, /eq\(bookings\.status, 'completed'\)/);
});

test('vacating approval recomputes notice from billing coverage SSOT', () => {
  assert.match(vacating, /computeNoticeDeductionForBooking/);
  const approveStart = vacating.indexOf('export async function approveVacatingRequest');
  const approveBlock = vacating.slice(approveStart, approveStart + 3500);
  assert.match(approveBlock, /noticeBreakdown\.noticeDeductionPaise/);
  assert.match(approveBlock, /frozenNoticePenaltyPaise: frozenNoticePaise/);
});

test('canonical resident routes: /account/resident is My Stay hub with payments default', () => {
  assert.match(residentPage, /ResidentStaySection/);
  assert.match(residentPage, /staySub/);
  assert.doesNotMatch(residentPage, /legacyResidentTabHref\('home'\)/);
});

test('profile page: residents see account profile, not stay dashboard', () => {
  assert.match(profilePage, /ResidentAccountProfileSection/);
  assert.match(profilePage, /redirect\('\/account\/resident'\)/);
  assert.doesNotMatch(profilePage, /activeTab=\{residentTab\}[\s\S]*profileSub/);
});

test('Manju production identifiers documented for regression audits', () => {
  const script = readFileSync(
    join(process.cwd(), 'scripts/verify-and-complete-manju-checkout.ts'),
    'utf8',
  );
  assert.match(script, /APG-2026-0017/);
  assert.match(script, /04265c06-f998-4696-82d9-7b1934c7da35/);
  assert.match(script, /finalizeVacatingOccupancy|approveCheckoutSettlement/);
});
