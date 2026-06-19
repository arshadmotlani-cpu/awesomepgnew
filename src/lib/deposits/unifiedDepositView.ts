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

export function sanitizeUnifiedDepositView(view: UnifiedDepositView): UnifiedDepositView {
  return {
    bookingId: String(view.bookingId),
    customerId: String(view.customerId),
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

export function sanitizeDepositWalletPreview(preview: DepositWalletPreview): DepositWalletPreview {
  return {
    action: preview.action,
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
