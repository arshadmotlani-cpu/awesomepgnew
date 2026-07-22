/**
 * Deep links for Payment Review Workspace (SSOT for all payment approval entry points).
 * Client-safe — no database imports.
 */

export function paymentReviewWorkspaceHref(reviewKey: string): string {
  return `/admin/payment-review/${encodeURIComponent(reviewKey)}`;
}

export function qrPaymentReviewKey(recordId: string): string {
  return `qr-${recordId}`;
}

/** Legacy operations focus links redirect to workspace. */
export function legacyOperationsFocusToWorkspaceHref(focusKey: string): string {
  return paymentReviewWorkspaceHref(focusKey);
}
