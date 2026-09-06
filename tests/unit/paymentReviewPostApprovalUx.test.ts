import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  PAYMENT_REVIEW_APPROVED_TOAST,
  paymentReviewPostApprovalChrome,
  resolvePaymentReviewApprovalPhase,
} from '@/src/lib/operations/paymentReviewPostApprovalUx';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('payment review post-approval UX', () => {
  test('success restores navigation immediately and never blocks the shell', () => {
    const chrome = paymentReviewPostApprovalChrome(
      resolvePaymentReviewApprovalPhase({ busy: false, approved: true, hasError: false }),
    );
    assert.equal(chrome.showBlockingOverlay, false);
    assert.equal(chrome.overlayCapturesPointerEvents, false);
    assert.equal(chrome.shellNavigationBlocked, false);
    assert.equal(chrome.allowImmediateRouteChange, true);
    assert.equal(chrome.callRouterRefreshOnSuccess, false);
    assert.equal(chrome.awaitQueueRefreshBeforeNavigate, false);
    assert.equal(chrome.backToQueueDisabled, false);
    assert.equal(chrome.successBannerVisible, true);
    assert.equal(chrome.approveDisabled, true);
    assert.equal(chrome.rejectDisabled, true);
    assert.equal(PAYMENT_REVIEW_APPROVED_TOAST, 'Payment approved');
  });

  test('success overlay does not permanently block pointer events', () => {
    const chrome = paymentReviewPostApprovalChrome('success');
    assert.equal(chrome.showBlockingOverlay, false);
    assert.equal(chrome.overlayCapturesPointerEvents, false);
  });

  test('sidebar remains clickable after success and during mutation', () => {
    for (const phase of ['idle', 'mutating', 'success', 'error'] as const) {
      const chrome = paymentReviewPostApprovalChrome(phase);
      assert.equal(chrome.shellNavigationBlocked, false, phase);
      assert.equal(chrome.allowImmediateRouteChange, true, phase);
      assert.equal(chrome.showBlockingOverlay, false, phase);
    }
  });

  test('clicking another route immediately after success is not gated on queue refresh', () => {
    const chrome = paymentReviewPostApprovalChrome('success');
    assert.equal(chrome.awaitQueueRefreshBeforeNavigate, false);
    assert.equal(chrome.callRouterRefreshOnSuccess, false);
    assert.equal(chrome.allowImmediateRouteChange, true);
  });

  test('background queue refresh cannot block navigation', () => {
    const chrome = paymentReviewPostApprovalChrome('success');
    assert.equal(chrome.awaitQueueRefreshBeforeNavigate, false);
    const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
    const approveFn = workspace.slice(
      workspace.indexOf('async function handleApprove'),
      workspace.indexOf('const kycTone'),
    );
    assert.match(approveFn, /void refreshAdminNavBadges\(\)/);
    assert.doesNotMatch(approveFn, /await refreshAdminNavBadges\(\)/);
    assert.doesNotMatch(approveFn, /router\.refresh\(\)/);
    assert.doesNotMatch(approveFn, /router\.push\(redirectTo\)/);
    assert.doesNotMatch(approveFn, /Returning to operations queue/);
    assert.doesNotMatch(workspace, /backdrop-blur-sm/);
    assert.match(workspace, /data-navigation-blocked=\{chrome\.shellNavigationBlocked \? 'true' : 'false'\}/);
  });

  test('approval remains idempotent — duplicate approve cannot re-fire', () => {
    const success = paymentReviewPostApprovalChrome('success');
    assert.equal(success.approveDisabled, true);
    const mutating = paymentReviewPostApprovalChrome('mutating');
    assert.equal(mutating.approveDisabled, true);

    const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
    assert.match(workspace, /if \(busy \|\| approved\) return/);
    assert.match(workspace, /disabled=\{chrome\.approveDisabled\}/);

    const qr = read('src/services/qrPayments.ts');
    assert.match(qr, /outcome: 'already_approved'/);
    assert.match(qr, /if \(alreadyProcessed\) \{[\s\S]*already_approved/);
  });

  test('duplicate approval cannot double-apply payment', () => {
    const lifecycle = read('src/services/bookingLifecycle.ts');
    assert.match(lifecycle, /providerPaymentId/);
    assert.match(lifecycle, /if \(existing\)/);
    assert.match(lifecycle, /stateChanged: false/);

    const actions = read('app/(admin)/admin/payments/actions.ts');
    assert.match(actions, /outcome === 'already_approved'/);
    assert.match(actions, /PAYMENT_ALREADY_APPROVED_MESSAGE/);
  });

  test('approval failure still shows retryable error without success copy', () => {
    const chrome = paymentReviewPostApprovalChrome(
      resolvePaymentReviewApprovalPhase({ busy: false, approved: false, hasError: true }),
    );
    assert.equal(chrome.successBannerVisible, false);
    assert.equal(chrome.approveDisabled, false);
    assert.equal(chrome.shellNavigationBlocked, false);
    assert.equal(chrome.showBlockingOverlay, false);

    const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
    const approveFn = workspace.slice(
      workspace.indexOf('async function handleApprove'),
      workspace.indexOf('const kycTone'),
    );
    const failBlock = approveFn.slice(
      approveFn.indexOf('if (!result.ok)'),
      approveFn.indexOf('stashOperationsApprovedToast'),
    );
    assert.match(failBlock, /setError\(result\.message \?\? 'Approval failed\.'\)/);
    assert.match(failBlock, /setBusy\(false\)/);
    assert.doesNotMatch(failBlock, /setApproved\(true\)/);
    assert.match(workspace, /data-payment-review-error/);
  });

  test('existing payment-review behavior remains intact', () => {
    const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
    assert.match(workspace, /approvePaymentReviewVerificationAction/);
    assert.match(workspace, /buildPaymentReviewVerification/);
    assert.doesNotMatch(workspace, /PaymentAllocationEditor/);
    assert.match(workspace, /data-payment-review-article/);
    assert.match(workspace, /Back to queue[\s\S]*Reject[\s\S]*Approve/);

    const page = read('app/(admin)/admin/payment-review/[reviewKey]/page.tsx');
    assert.match(page, /PaymentReviewWorkspace/);
    assert.match(page, /PaymentReviewResolvedPanel/);
    assert.doesNotMatch(page, /redirect\(operationsFilterHref/);

    const actions = read('app/(admin)/admin/payments/actions.ts');
    const fast = actions.slice(
      actions.indexOf('function revalidatePaymentReviewSurfacesFast'),
      actions.indexOf('function revalidatePaymentReviewSurfacesDeferred'),
    );
    assert.match(fast, /revalidatePath\('\/admin\/payment-review\/\[reviewKey\]', 'page'\)/);
    assert.doesNotMatch(fast, /revalidatePath\('\/admin\/payment-review', 'layout'\)/);
  });
});
