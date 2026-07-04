import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('getOperationsCenterData does not call loadUnifiedOperationsQueue (prevents SSR recursion)', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/operationsCenter.ts'), 'utf8');
  assert.doesNotMatch(src, /loadApprovalQueueSnapshot/);
  assert.doesNotMatch(src, /loadUnifiedOperationsQueue/);
  assert.match(src, /getPendingPaymentReviewsForRequest/);
});

test('adminNavBadges uses single unified queue load', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminNavBadges.ts'), 'utf8');
  assert.match(src, /getUnifiedOperationsQueueForRequest/);
  assert.doesNotMatch(src, /getWaitingForApprovalCount/);
});

test('overview page does not sync action items on every load', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/overview/page.tsx'),
    'utf8',
  );
  assert.match(src, /syncActions:\s*false/);
  assert.doesNotMatch(src, /syncActions:\s*true/);
});
