import type {
  RefundConsoleCheckoutContext,
  RefundConsoleDeductionRow,
  RefundConsoleTimelineEvent,
  RefundConsoleTransferRow,
  RefundConsoleWallet,
  RefundConsoleWorkspace,
} from '@/src/services/refundConsole';

/** Client-safe workspace — all dates are ISO strings (fixes RSC → client crash). */
export type RefundConsoleWorkspaceDTO = Omit<
  RefundConsoleWorkspace,
  'deductions' | 'transfers' | 'timeline' | 'checkout'
> & {
  deductions: Array<Omit<RefundConsoleDeductionRow, 'occurredAt'> & { occurredAt: string }>;
  transfers: Array<Omit<RefundConsoleTransferRow, 'occurredAt'> & { occurredAt: string }>;
  timeline: Array<Omit<RefundConsoleTimelineEvent, 'occurredAt'> & { occurredAt: string }>;
  checkout: (Omit<RefundConsoleCheckoutContext, never> & {
    settlementHref: string;
  }) | null;
};

export function toRefundConsoleWorkspaceDTO(
  workspace: RefundConsoleWorkspace,
): RefundConsoleWorkspaceDTO {
  return {
    ...workspace,
    deductions: workspace.deductions.map((d) => ({
      ...d,
      occurredAt: d.occurredAt.toISOString(),
    })),
    transfers: workspace.transfers.map((t) => ({
      ...t,
      occurredAt: t.occurredAt.toISOString(),
    })),
    timeline: workspace.timeline.map((e) => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
    })),
    checkout: workspace.checkout
      ? {
          ...workspace.checkout,
          settlementHref: `/admin/checkout-settlements/${workspace.checkout.settlementId}`,
        }
      : null,
  };
}
