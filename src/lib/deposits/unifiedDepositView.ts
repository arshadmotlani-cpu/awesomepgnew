/**
 * Client-safe unified deposit view types + paise sanitization.
 * Keep this module free of db/server imports so client components can use it.
 */

import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';

export type UnifiedDepositView = {
  bookingId: string;
  customerId: string;
  requiredPaise: number;
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  refundablePaise: number;
  depositDuePaise: number;
  depositCollectionStatus: string;
  invoiceStatus: string | null;
  walletInSync: boolean;
  walletMismatchReason: string | null;
};

export type DepositWalletPreview = {
  action: 'rebuild' | 'cancel';
  current: UnifiedDepositView;
  expected: UnifiedDepositView;
  warnings: string[];
  /** Whether ledger rows will be inserted (always false for rebuild). */
  willModifyLedger: boolean;
  /** For cancel: refundable balance removed from wallet via deduction. */
  removesFromWalletPaise: number;
};

/**
 * Admin-facing collected amount — after a downward correction the ledger still
 * sums gross collected entries; cap to required when fully paid.
 */
export function effectiveDepositCollectedPaise(input: {
  grossCollectedPaise: unknown;
  requiredPaise: unknown;
  depositDuePaise: unknown;
}): number {
  const gross = guardDepositPaise(input.grossCollectedPaise, 'grossCollectedPaise');
  const required = guardDepositPaise(input.requiredPaise, 'requiredPaise');
  const due = guardDepositPaise(input.depositDuePaise, 'depositDuePaise');
  if (due <= 0 && required > 0 && gross > required) {
    return required;
  }
  return gross;
}

/** Cap refundable display when gross ledger balance exceeds corrected required deposit. */
export function effectiveDepositRefundablePaise(input: {
  refundableBalancePaise: unknown;
  requiredPaise: unknown;
  depositDuePaise: unknown;
}): number {
  const refundable = guardDepositPaise(input.refundableBalancePaise, 'refundableBalancePaise');
  const required = guardDepositPaise(input.requiredPaise, 'requiredPaise');
  const due = guardDepositPaise(input.depositDuePaise, 'depositDuePaise');
  if (due <= 0 && required > 0 && refundable > required) {
    return required;
  }
  return refundable;
}

export type DepositAdminDisplayAmounts = {
  requiredPaise: number;
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  deductionsPaise: number;
  refundablePaise: number;
};

/**
 * Admin UI amounts — hide ledger-only collection adjustments from "Deductions"
 * and cap collected/refundable to required when the deposit is fully paid.
 */
export function depositAdminDisplayAmounts(input: {
  grossCollectedPaise: unknown;
  grossDeductedPaise: unknown;
  grossRefundedPaise: unknown;
  grossRefundableBalancePaise: unknown;
  requiredPaise: unknown;
  depositDuePaise: unknown;
  /** Tagged ledger rows from admin collected-balance corrections. */
  taggedCollectionAdjustmentPaise?: unknown;
}): DepositAdminDisplayAmounts {
  const requiredPaise = guardDepositPaise(input.requiredPaise, 'display.requiredPaise');
  const depositDuePaise = guardDepositPaise(input.depositDuePaise, 'display.depositDuePaise');
  const grossCollectedPaise = guardDepositPaise(
    input.grossCollectedPaise,
    'display.grossCollectedPaise',
  );
  const grossDeductedPaise = guardDepositPaise(input.grossDeductedPaise, 'display.grossDeductedPaise');
  const grossRefundedPaise = guardDepositPaise(input.grossRefundedPaise, 'display.grossRefundedPaise');
  const grossRefundableBalancePaise = guardDepositPaise(
    input.grossRefundableBalancePaise,
    'display.grossRefundableBalancePaise',
  );
  const taggedCollectionAdjustmentPaise = guardDepositPaise(
    input.taggedCollectionAdjustmentPaise ?? 0,
    'display.taggedCollectionAdjustmentPaise',
  );

  const collectedPaise = effectiveDepositCollectedPaise({
    grossCollectedPaise,
    requiredPaise,
    depositDuePaise,
  });

  const untaggedDeductedPaise = Math.max(0, grossDeductedPaise - taggedCollectionAdjustmentPaise);
  let legacyCollectionAdjustmentPaise = 0;
  if (depositDuePaise <= 0 && requiredPaise > 0 && untaggedDeductedPaise > 0) {
    const excessCollectedPaise = Math.max(0, grossCollectedPaise - requiredPaise);
    if (grossRefundableBalancePaise === requiredPaise) {
      legacyCollectionAdjustmentPaise = untaggedDeductedPaise;
    } else {
      legacyCollectionAdjustmentPaise = Math.min(untaggedDeductedPaise, excessCollectedPaise);
    }
  }

  const totalCollectionAdjustmentPaise =
    taggedCollectionAdjustmentPaise + legacyCollectionAdjustmentPaise;
  const deductedPaise = Math.max(0, grossDeductedPaise - totalCollectionAdjustmentPaise);
  const refundedPaise = grossRefundedPaise;
  const deductionsPaise = deductedPaise + refundedPaise;
  const refundablePaise = effectiveDepositRefundablePaise({
    refundableBalancePaise: grossRefundableBalancePaise,
    requiredPaise,
    depositDuePaise,
  });

  return {
    requiredPaise,
    collectedPaise,
    deductedPaise,
    refundedPaise,
    deductionsPaise,
    refundablePaise,
  };
}

export function emptyUnifiedDepositView(): UnifiedDepositView {
  return {
    bookingId: '',
    customerId: '',
    requiredPaise: 0,
    collectedPaise: 0,
    deductedPaise: 0,
    refundedPaise: 0,
    refundablePaise: 0,
    depositDuePaise: 0,
    depositCollectionStatus: '',
    invoiceStatus: null,
    walletInSync: false,
    walletMismatchReason: null,
  };
}

export function sanitizeUnifiedDepositView(
  view?: Partial<UnifiedDepositView> | null,
): UnifiedDepositView {
  if (!view || typeof view !== 'object') {
    return emptyUnifiedDepositView();
  }

  return {
    bookingId: String(view.bookingId ?? ''),
    customerId: String(view.customerId ?? ''),
    requiredPaise: guardDepositPaise(view.requiredPaise, 'view.requiredPaise'),
    collectedPaise: guardDepositPaise(view.collectedPaise, 'view.collectedPaise'),
    deductedPaise: guardDepositPaise(view.deductedPaise, 'view.deductedPaise'),
    refundedPaise: guardDepositPaise(view.refundedPaise, 'view.refundedPaise'),
    refundablePaise: guardDepositPaise(view.refundablePaise, 'view.refundablePaise'),
    depositDuePaise: guardDepositPaise(view.depositDuePaise, 'view.depositDuePaise'),
    depositCollectionStatus: String(view.depositCollectionStatus ?? ''),
    invoiceStatus: view.invoiceStatus != null ? String(view.invoiceStatus) : null,
    walletInSync: Boolean(view.walletInSync),
    walletMismatchReason:
      view.walletMismatchReason != null ? String(view.walletMismatchReason) : null,
  };
}

export function sanitizeDepositWalletPreview(
  preview?: Partial<DepositWalletPreview> | null,
): DepositWalletPreview {
  if (!preview || typeof preview !== 'object') {
    const empty = emptyUnifiedDepositView();
    return {
      action: 'rebuild',
      current: empty,
      expected: empty,
      warnings: [],
      willModifyLedger: false,
      removesFromWalletPaise: 0,
    };
  }

  return {
    action: preview.action === 'cancel' ? 'cancel' : 'rebuild',
    current: sanitizeUnifiedDepositView(preview.current),
    expected: sanitizeUnifiedDepositView(preview.expected),
    warnings: Array.isArray(preview.warnings) ? preview.warnings.map(String) : [],
    willModifyLedger: Boolean(preview.willModifyLedger),
    removesFromWalletPaise: guardDepositPaise(
      preview.removesFromWalletPaise,
      'preview.removesFromWalletPaise',
    ),
  };
}

/** Safe payload for RSC → client deposit view props. */
export function clientSafeDepositView(
  view?: Partial<UnifiedDepositView> | null,
): UnifiedDepositView {
  return sanitizeUnifiedDepositView(view);
}
