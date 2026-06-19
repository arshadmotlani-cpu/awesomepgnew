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
