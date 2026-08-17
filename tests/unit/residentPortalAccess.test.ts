import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(process.cwd(), 'src/lib/residents/residentPortalAccess.ts'),
  'utf8',
);

test('resident portal SSOT: active stay unlocks portal before reserve block', () => {
  assert.match(src, /getActiveTenancyForCustomer/);
  assert.match(src, /Active non-reserve tenancy unlocks the portal/);
  assert.match(src, /if \(tenancy && tenancy\.durationMode !== 'reserve'\) \{\s*return true;/);
});

test('resident portal SSOT: checkout limbo and completed stays keep canonical UI', () => {
  assert.match(src, /customerHasCheckoutLimboPortalAccess/);
  assert.match(src, /customerHasCompletedStayPortalAccess/);
});

test('open reserve redirect suppressed when active tenancy exists', () => {
  assert.match(src, /Returns null when the customer already has an active non-reserve tenancy/);
  const fnStart = src.indexOf('export async function getOpenReserveBookingCode');
  const fn = src.slice(fnStart, fnStart + 900);
  assert.match(fn, /getActiveTenancyForCustomer/);
  assert.match(fn, /return null/);
});

test('resident routes layout prefers portal access over reserve redirect', () => {
  const layout = readFileSync(
    join(process.cwd(), 'app/(customer)/account/resident/layout.tsx'),
    'utf8',
  );
  assert.match(layout, /customerHasResidentPortalAccess/);
  assert.match(layout, /getOpenReserveBookingCode/);
  const accessIdx = layout.indexOf('customerHasResidentPortalAccess');
  const reserveIdx = layout.indexOf('getOpenReserveBookingCode');
  assert.ok(accessIdx >= 0 && reserveIdx > accessIdx, 'tenancy/access must be checked before reserve redirect');
});

test('profile page gates resident dashboard on hasResidentPortalAccess', () => {
  const profile = readFileSync(
    join(process.cwd(), 'app/(customer)/account/profile/page.tsx'),
    'utf8',
  );
  assert.match(profile, /hasResidentPortalAccess && !explicitSettings/);
});

test('Resident Brain integrity module exports audit + safe repair', () => {
  const integrity = readFileSync(
    join(process.cwd(), 'src/lib/residents/residentBrainIntegrity.ts'),
    'utf8',
  );
  assert.match(integrity, /PORTAL_BLOCKED_BY_ORPHAN_RESERVE/);
  assert.match(integrity, /MISSING_CURRENT_MONTH_RENT/);
  assert.match(integrity, /export async function runResidentBrainIntegrityAudit/);
  assert.match(integrity, /export async function repairOrphanReservesBlockingActiveStay/);
});

test('System Health audit includes Resident Brain Integrity section', () => {
  const health = readFileSync(
    join(process.cwd(), 'src/services/systemHealthAudit.ts'),
    'utf8',
  );
  assert.match(health, /Resident Brain Integrity/);
  assert.match(health, /runResidentBrainIntegrityAudit/);
});
