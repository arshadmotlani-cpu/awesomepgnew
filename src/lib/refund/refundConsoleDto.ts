import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type {
  RefundConsoleCheckoutContext,
  RefundConsoleDeductionRow,
  RefundConsoleTimelineEvent,
  RefundConsoleTransferRow,
  RefundConsoleWallet,
  RefundConsoleWorkspace,
} from '@/src/services/refundConsole';

function normalizeDateField(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed.slice(0, 10) : null;
}

/** Client-safe workspace — no ledger rows, all dates are ISO strings. */
export type RefundConsoleWorkspaceDTO = Omit<
  RefundConsoleWorkspace,
  'ledger' | 'deductions' | 'transfers' | 'timeline' | 'checkout'
> & {
  deductions: Array<Omit<RefundConsoleDeductionRow, 'occurredAt'> & { occurredAt: string }>;
  transfers: Array<Omit<RefundConsoleTransferRow, 'occurredAt'> & { occurredAt: string }>;
  timeline: Array<Omit<RefundConsoleTimelineEvent, 'occurredAt'> & { occurredAt: string }>;
  checkout: (Omit<RefundConsoleCheckoutContext, never> & {
    settlementHref: string;
  }) | null;
};

function toClientWallet(wallet: RefundConsoleWallet): RefundConsoleWallet {
  return {
    depositPaidPaise: guardDepositPaise(wallet.depositPaidPaise, 'dto.wallet.depositPaidPaise'),
    depositUsedPaise: guardDepositPaise(wallet.depositUsedPaise, 'dto.wallet.depositUsedPaise'),
    depositTransferredPaise: guardDepositPaise(
      wallet.depositTransferredPaise,
      'dto.wallet.depositTransferredPaise',
    ),
    electricityDeductionPaise: guardDepositPaise(
      wallet.electricityDeductionPaise,
      'dto.wallet.electricityDeductionPaise',
    ),
    policyDeductionPaise: guardDepositPaise(
      wallet.policyDeductionPaise,
      'dto.wallet.policyDeductionPaise',
    ),
    otherDeductionsPaise: guardDepositPaise(
      wallet.otherDeductionsPaise,
      'dto.wallet.otherDeductionsPaise',
    ),
    refundPaidPaise: guardDepositPaise(wallet.refundPaidPaise, 'dto.wallet.refundPaidPaise'),
    remainingDepositPaise: guardDepositPaise(
      wallet.remainingDepositPaise,
      'dto.wallet.remainingDepositPaise',
    ),
  };
}

export function toRefundConsoleWorkspaceDTO(
  workspace: RefundConsoleWorkspace,
): RefundConsoleWorkspaceDTO {
  const {
    ledger: _ledger,
    deductions,
    transfers,
    timeline,
    checkout,
    wallet,
    suggestedRefundPaise,
    refundableBalancePaise,
    ...rest
  } = workspace;

  return {
    ...rest,
    checkInDate: normalizeDateField(rest.checkInDate),
    checkOutDate: normalizeDateField(rest.checkOutDate),
    vacatingDate: normalizeDateField(rest.vacatingDate),
    wallet: toClientWallet(wallet),
    suggestedRefundPaise: guardDepositPaise(
      suggestedRefundPaise,
      'dto.suggestedRefundPaise',
    ),
    refundableBalancePaise: guardDepositPaise(
      refundableBalancePaise,
      'dto.refundableBalancePaise',
    ),
    deductions: deductions.map((d) => ({
      ...d,
      amountPaise: guardDepositPaise(d.amountPaise, 'dto.deduction.amountPaise'),
      occurredAt: d.occurredAt.toISOString(),
    })),
    transfers: transfers.map((t) => ({
      ...t,
      amountPaise: guardDepositPaise(t.amountPaise, 'dto.transfer.amountPaise'),
      occurredAt: t.occurredAt.toISOString(),
    })),
    timeline: timeline.map((e) => ({
      ...e,
      amountPaise:
        e.amountPaise == null
          ? null
          : guardDepositPaise(Math.abs(e.amountPaise), 'dto.timeline.amountPaise'),
      occurredAt: e.occurredAt.toISOString(),
    })),
    checkout: checkout
      ? {
          ...checkout,
          finalRefundPaise:
            checkout.finalRefundPaise == null
              ? null
              : guardDepositPaise(checkout.finalRefundPaise, 'dto.checkout.finalRefundPaise'),
          noticeDeductionPaise: guardDepositPaise(
            checkout.noticeDeductionPaise,
            'dto.checkout.noticeDeductionPaise',
          ),
          electricitySharePaise: guardDepositPaise(
            checkout.electricitySharePaise,
            'dto.checkout.electricitySharePaise',
          ),
          damageChargePaise: guardDepositPaise(
            checkout.damageChargePaise,
            'dto.checkout.damageChargePaise',
          ),
          cleaningChargePaise: guardDepositPaise(
            checkout.cleaningChargePaise,
            'dto.checkout.cleaningChargePaise',
          ),
          customChargePaise: guardDepositPaise(
            checkout.customChargePaise,
            'dto.checkout.customChargePaise',
          ),
          settlementHref: `/admin/checkout-settlements/${checkout.settlementId}`,
        }
      : null,
  };
}
