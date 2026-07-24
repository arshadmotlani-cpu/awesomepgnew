/**
 * Shared read-only move-out billing validation for production audits.
 */
import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { deriveMoveOutWorkflowStage } from '@/src/lib/moveOut/moveOutWorkflowStages';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { validateBillingEngineSettlement } from '@/src/lib/billing/billingEngineValidation';
import { loadVacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import {
  buildMoveOutSettlementExplanations,
  type SettlementExplanationFailure,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import { getCheckoutSettlementDetailForBooking } from '@/src/services/checkoutSettlement';

export type MoveOutValidationRowInput = {
  bookingId: string;
  bookingCode: string;
  customerFullName: string;
  vacatingRequestId: string;
  vacatingStatus: string;
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaiseSnapshot: number;
  stayType: string | null;
  durationMode: string | null;
  deductionPaise: number;
  pipelineItem?: MoveOutPipelineItem | null;
};

export type MoveOutValidationRowResult = {
  bookingCode: string;
  workflowStage: string;
  pipelineStage: string;
  cohort: 'active' | 'completed';
  ok: boolean;
  signatures: string[];
  failures: SettlementExplanationFailure[];
  refundTotalPaise: number | null;
};

export async function validateMoveOutBillingRow(
  input: MoveOutValidationRowInput,
  cohort: 'active' | 'completed',
): Promise<MoveOutValidationRowResult> {
  const workflow = input.pipelineItem
    ? deriveMoveOutWorkflowStage(input.pipelineItem)
    : { id: cohort === 'completed' ? 'completed' : 'pending_request' as const, label: '', nextAction: '', requiresAdminAction: false, waitingOn: 'none' as const };

  const checkout = await getCheckoutSettlementDetailForBooking(input.bookingId);
  const lockedWaterfall = checkout?.waterfall ?? null;
  const useLocked =
    lockedWaterfall != null &&
    (workflow.id === 'settlement_review' ||
      workflow.id === 'refund_ready' ||
      workflow.id === 'completed');

  let presentation = null;
  try {
    if (useLocked && lockedWaterfall) {
      presentation = await loadVacatingBillingPresentation({
        bookingId: input.bookingId,
        noticeGivenDate: input.noticeGivenDate,
        vacatingDate: input.vacatingDate,
        monthlyRentPaiseSnapshot: input.monthlyRentPaiseSnapshot,
        stayType: input.stayType,
        durationMode: input.durationMode,
        waterfall: lockedWaterfall,
        mode: checkout?.amountsLocked ? 'final' : 'baseline',
        treatAsApprovedForTail: true,
      });
    } else {
      presentation = await loadVacatingBillingPresentation({
        bookingId: input.bookingId,
        noticeGivenDate: input.noticeGivenDate,
        vacatingDate: input.vacatingDate,
        monthlyRentPaiseSnapshot: input.monthlyRentPaiseSnapshot,
        stayType: input.stayType,
        durationMode: input.durationMode,
        mode: 'estimate',
        treatAsApprovedForTail: true,
      });
    }
  } catch {
    return {
      bookingCode: input.bookingCode,
      workflowStage: workflow.id,
      pipelineStage: input.pipelineItem?.stage ?? '—',
      cohort,
      ok: false,
      signatures: ['PRESENTATION_EXCEPTION'],
      failures: [
        {
          code: 'PRESENTATION_EXCEPTION',
          message: 'Failed to load presentation',
          signature: 'PRESENTATION_EXCEPTION',
        },
      ],
      refundTotalPaise: null,
    };
  }

  if (!presentation) {
    return {
      bookingCode: input.bookingCode,
      workflowStage: workflow.id,
      pipelineStage: input.pipelineItem?.stage ?? '—',
      cohort,
      ok: false,
      signatures: ['PRESENTATION_LOAD_FAILED'],
      failures: [
        {
          code: 'PRESENTATION_LOAD_FAILED',
          message: 'Presentation null',
          signature: 'PRESENTATION_LOAD_FAILED',
        },
      ],
      refundTotalPaise: null,
    };
  }

  const report = buildMoveOutSettlementExplanations(presentation, {
    bookingId: input.bookingId,
    bookingCode: input.bookingCode,
    residentName: input.customerFullName,
    vacatingRequestId: input.vacatingRequestId,
  });

  const validation = validateBillingEngineSettlement(report, presentation, {
    storedNoticeDeductionPaise:
      input.vacatingStatus === 'pending' ? input.deductionPaise : null,
    lockedWaterfall: useLocked ? (lockedWaterfall as CheckoutSettlementWaterfall) : null,
  });

  const signatures = [...new Set(validation.failures.map((f) => f.signature))];

  return {
    bookingCode: input.bookingCode,
    workflowStage: workflow.id,
    pipelineStage: input.pipelineItem?.stage ?? '—',
    cohort,
    ok: validation.ok,
    signatures,
    failures: validation.failures,
    refundTotalPaise: presentation.waterfall.refund.totalPaise,
  };
}
