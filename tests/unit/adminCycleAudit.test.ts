import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/** Static call-graph edges that must NOT exist (would reintroduce SSR recursion). */
const FORBIDDEN_EDGES: Array<[from: string, to: string, file: string]> = [
  [
    'getOperationsCenterData',
    'loadApprovalQueueSnapshot',
    'src/services/operationsCenter.ts',
  ],
  [
    'getOperationsCenterData',
    'loadUnifiedOperationsQueue',
    'src/services/operationsCenter.ts',
  ],
  [
    'loadApprovalQueueSnapshot',
    'loadUnifiedOperationsQueue',
    'src/services/approvalService.ts',
  ],
];

function fileSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function fnBody(src: string, fnName: string): string {
  const marker = `export async function ${fnName}`;
  const alt = `async function ${fnName}`;
  const start = src.indexOf(marker) >= 0 ? src.indexOf(marker) : src.indexOf(alt);
  assert.ok(start >= 0, `function ${fnName} not found`);
  const nextExport = src.indexOf('\nexport ', start + 1);
  const nextAsyncFn = src.indexOf('\nasync function ', start + 1);
  const end = [nextExport, nextAsyncFn].filter((i) => i > start).sort((a, b) => a - b)[0];
  return end > start ? src.slice(start, end) : src.slice(start);
}

test('forbidden admin SSR recursion edges are absent', () => {
  for (const [from, to, file] of FORBIDDEN_EDGES) {
    const body = fnBody(fileSrc(file), from);
    assert.doesNotMatch(
      body,
      new RegExp(to),
      `${file}: ${from} must not call ${to}`,
    );
  }
});

test('admin page renders do not call syncActionItems', () => {
  for (const file of [
    'app/(admin)/admin/overview/page.tsx',
    'app/(admin)/admin/operations/page.tsx',
    'app/(admin)/admin/notifications/page.tsx',
    'app/(admin)/admin/residents/[customerId]/page.tsx',
  ]) {
    const src = fileSrc(file);
    assert.doesNotMatch(src, /syncActionItems\s*\(/, `${file} must not sync on render`);
  }
});

test('overview sync is only via explicit syncOverviewAction', () => {
  const actions = fileSrc('app/(admin)/admin/overview/actions.ts');
  assert.match(actions, /syncActionItems\s*\(/);
  const page = fileSrc('app/(admin)/admin/overview/page.tsx');
  assert.match(page, /syncActions:\s*false/);
});

test('revenue command center avoids full operations queue for payment counts', () => {
  const src = fileSrc('src/services/revenueCommandCenter.ts');
  const body = fnBody(src, 'getRevenueCommandCenterData');
  assert.match(body, /getPendingPaymentReviewsForRequest/);
  assert.doesNotMatch(body, /loadApprovalQueueSnapshot/);
  assert.doesNotMatch(body, /loadUnifiedOperationsQueue/);
});

test('unified queue base build is cached per request', () => {
  const src = fileSrc('src/services/unifiedOperationsQueue.ts');
  assert.match(src, /buildUnifiedOperationsQueueBaseCached/);
  assert.match(src, /getUnifiedOperationsQueueForRequest/);
});

test('payment proof reviews are cached per request', () => {
  const src = fileSrc('src/services/paymentProofQueue.ts');
  assert.match(src, /listPendingPaymentReviewsCached/);
  assert.match(src, /getPendingPaymentReviewsForRequest/);
});
