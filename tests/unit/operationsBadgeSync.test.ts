import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(rel: string): string {
  return readFileSync(rel, 'utf8');
}

test('AdminLiveRefreshProvider does not blindly overwrite polled badges with stale layout SSR', () => {
  const provider = read('src/components/admin/AdminLiveRefreshProvider.tsx');
  assert.match(provider, /lastPollRef/);
  assert.match(provider, /nextOps <= polledOps/);
  assert.doesNotMatch(provider, /setBadges\(initialBadges\);\s*\}, \[initialBadges\]\);/);
});

test('PaymentReviewWorkspace refreshes layout before badge poll and redirect', () => {
  const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
  assert.match(workspace, /router\.refresh\(\)/);
  assert.match(workspace, /await refreshAdminNavBadges\(\)/);
  assert.doesNotMatch(workspace, /setTimeout\(\(\) => \{\s*router\.push/);
});

test('buildUnifiedOperationsQueue resolves stale payment review artifacts on load', () => {
  const src = read('src/services/unifiedOperationsQueue.ts');
  assert.match(src, /resolveStalePaymentReviewArtifacts\(session\)/);
});

test('revalidateAdminSurfaces invalidates admin layout for sidebar badges', () => {
  const src = read('src/lib/admin/revalidateSurfaces.ts');
  assert.match(src, /revalidatePath\('\/admin', 'layout'\)/);
});
