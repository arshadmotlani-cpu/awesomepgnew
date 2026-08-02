/**
 * Operations Centre supplementary queue items — not sourced from Room OS work queue.
 * Shared by legacy and Room OS paths (KYC, refunds) without residentOperationsDashboard.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import { isActiveCheckoutSettlement } from '@/src/lib/residents/residentLifecycleState';
import {
  PAYOUT_PENDING_STATUS,
  RECORD_PAYOUT_CTA,
} from '@/src/lib/payout/payoutDisplayTerminology';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import {
  isDismissedFromOperationsQueue,
  type OperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';

export async function loadSupplementaryOperationsQueueItems(
  session: AdminSession,
  dismissalIndex: OperationsQueueDismissalIndex,
  checkoutSettlements: Awaited<ReturnType<typeof listPipelineCheckoutSettlements>>,
): Promise<UnifiedOpsItem[]> {
  const [kycPending] = await Promise.all([listPendingKycSubmissions()]);
  const items: UnifiedOpsItem[] = [];

  const activeCheckoutCustomerIds = new Set(
    checkoutSettlements
      .filter((s) => isActiveCheckoutSettlement(s))
      .map((s) => s.customerId),
  );

  for (const settlement of checkoutSettlements) {
    if (settlement.status !== 'refund_pending') continue;
    if (isStaleZeroRefundSettlement(settlement)) continue;
    if (
      isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: settlement.customerId,
        bookingId: settlement.bookingId,
        settlementId: settlement.id,
        vacatingRequestId: settlement.vacatingRequestId,
      })
    ) {
      continue;
    }

    items.push({
      id: `checkout-refund-${settlement.id}`,
      queue: 'refund_due',
      customerId: settlement.customerId,
      residentName: settlement.customerName,
      residentPhone: settlement.customerPhone,
      pgName: settlement.pgName,
      roomNumber: settlement.roomNumber,
      bedCode: settlement.bedCode,
      reason: 'Checkout refund waiting to be sent',
      openHref: refundConsoleHref(settlement.bookingId),
      openLabel: RECORD_PAYOUT_CTA,
      category: 'refund',
      bookingId: settlement.bookingId,
      amountPaise: settlement.finalRefundPaise ?? undefined,
      statusLabel: PAYOUT_PENDING_STATUS,
    });
  }

  for (const kyc of kycPending) {
    if (activeCheckoutCustomerIds.has(kyc.customerId)) continue;
    if (
      isDismissedFromOperationsQueue(dismissalIndex, { customerId: kyc.customerId })
    ) {
      continue;
    }

    items.push({
      id: `kyc-${kyc.id}`,
      queue: 'kyc_review',
      customerId: kyc.customerId,
      residentName: kyc.customerName,
      pgName: null,
      roomNumber: null,
      bedCode: null,
      reason: 'Identity documents awaiting review',
      openHref: `/admin/residents/kyc/${kyc.id}`,
      openLabel: 'Review KYC',
      category: 'kyc',
      bookingId: kyc.bookingId,
      kycSubmissionId: kyc.id,
    });
  }

  return items;
}
