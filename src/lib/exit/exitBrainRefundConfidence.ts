/**
 * Resident Exit Brain — refund estimate confidence score (pure).
 */
export type ExitRefundConfidenceInput = {
  hasMeterPhoto: boolean;
  meterPhotoMissing: boolean;
  electricityEstimatedPending: boolean;
  electricitySharePaise: number | null;
  settlementStatus: string | null;
  hasPayoutDetails: boolean;
  pendingRentPrincipalPaise: number;
  outstandingElectricityPaise: number;
};

export type ExitRefundConfidence = {
  confidencePercent: number;
  reasons: string[];
};

export function computeExitRefundConfidence(input: ExitRefundConfidenceInput): ExitRefundConfidence {
  let score = 100;
  const reasons: string[] = [];

  if (!input.hasMeterPhoto || input.meterPhotoMissing) {
    score -= 18;
    reasons.push('Checkout meter photo pending');
  }

  if (input.electricityEstimatedPending) {
    score -= 15;
    reasons.push('Final electricity is still an estimate');
  } else if (input.electricitySharePaise == null) {
    score -= 8;
    reasons.push('Electricity share not finalized');
  }

  if (input.pendingRentPrincipalPaise > 0) {
    score -= 10;
    reasons.push('Outstanding rent may change refund');
  }

  if (input.outstandingElectricityPaise > 0) {
    score -= 8;
    reasons.push('Unpaid electricity invoice outstanding');
  }

  if (
    input.settlementStatus === 'awaiting_resident_details' ||
    input.settlementStatus === 'awaiting_admin_review'
  ) {
    score -= 5;
    reasons.push('Settlement not fully approved');
  }

  if (!input.hasPayoutDetails && input.settlementStatus !== 'refund_paid') {
    score -= 5;
    reasons.push('Refund payout details not submitted');
  }

  return {
    confidencePercent: Math.max(0, Math.min(100, score)),
    reasons,
  };
}
