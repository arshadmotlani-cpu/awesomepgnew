import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(rel: string): string {
  return readFileSync(rel, 'utf8');
}

test('AdminLiveRefreshProvider polls on pathname change and guards against badge inflation', () => {
  const provider = read('src/components/admin/AdminLiveRefreshProvider.tsx');
  assert.match(provider, /usePathname/);
  assert.match(provider, /mergeBadgesPreferLowerOperations/);
  assert.match(provider, /hasPolledRef/);
});

test('PaymentReviewWorkspace uses internal scroll with pinned action footer', () => {
  const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
  const page = read('app/(admin)/admin/payment-review/[reviewKey]/page.tsx');
  const css = read('app/(admin)/admin/payment-review/payment-review.module.css');
  assert.match(workspace, /relative flex min-h-0 flex-1 flex-col/);
  assert.match(workspace, /min-h-0 flex-1 overflow-y-auto overscroll-y-contain/);
  assert.match(workspace, /<footer className="shrink-0 border-t border-white\/10/);
  assert.match(page, /data-payment-review-workspace/);
  assert.match(css, /apg-admin-scroll:has\(\[data-payment-review-workspace\]\)/);
});

test('deposit_due excludes bookings with approved checkout payment proof', () => {
  const queue = read('src/services/unifiedOperationsQueue.ts');
  assert.match(queue, /loadBookingIdsWithApprovedCheckoutProof/);
  assert.match(queue, /approvedCheckoutBookingIds\.has\(row\.bookingId\)/);
});

test('loadAdminNavBadges uses fast badge queue path', () => {
  const badges = read('src/services/adminNavBadges.ts');
  const queue = read('src/services/unifiedOperationsQueue.ts');
  assert.match(badges, /getUnifiedOperationsQueueForBadges/);
  assert.match(queue, /getUnifiedOperationsQueueForBadges/);
  assert.match(queue, /skipResidents: true/);
});

test('PaymentReviewWorkspace refreshes badges once after approve', () => {
  const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
  assert.match(workspace, /await refreshAdminNavBadges\(\)/);
  assert.doesNotMatch(workspace, /setTimeout/);
});
