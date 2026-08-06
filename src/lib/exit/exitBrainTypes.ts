/** Resident Exit Brain — public read model types (no internal IDs in resident UI). */

import type { ExitBrainPhase } from '@/src/lib/exit/exitBrainPhase';
import type { ExitChecklistItem } from '@/src/lib/exit/exitBrainChecklist';
import type { ExitTimelineEvent } from '@/src/lib/exit/exitBrainTimeline';

export type ExitBrainStatus = 'inactive' | 'active' | 'completed';

export type ExitRefundEstimateLineKey =
  | 'deposit_held'
  | 'pending_rent'
  | 'notice_penalty'
  | 'pending_electricity_invoice'
  | 'estimated_checkout_electricity'
  | 'frozen_late_fee'
  | 'damage_charges'
  | 'cleaning_charges'
  | 'other_charges'
  | 'collected'
  | 'estimated_refund';

export type ExitRefundEstimateLine = {
  key: ExitRefundEstimateLineKey;
  label: string;
  amountPaise: number;
};

export type ExitElectricityGenerated = {
  amountPaise: number;
  outstandingPaise: number;
  status: 'Paid' | 'Pending' | 'Recovered from Deposit' | 'Waived';
  billingMonth: string | null;
};

export type ExitElectricityEstimated = {
  amountPaise: number | null;
  residentSharePaise: number | null;
  pending: boolean;
  label: string;
};

export type ExitRefundEstimate = {
  lines: ExitRefundEstimateLine[];
  estimatedRefundPaise: number;
  depositHeldPaise: number;
  disclaimer: string;
  confidencePercent: number;
  confidenceReasons: string[];
};

import type { ExitBrainLifecycle } from '@/src/lib/exit/exitBrainStateMachine';
import type { ExitBrainCapabilityKey } from '@/src/lib/exit/exitBrainStateMachine';

export type ResidentExitBrainSnapshot = {
  apiVersion: 'exit-brain/v1';
  bookingId: string;
  status: ExitBrainStatus;
  phase: ExitBrainPhase;
  lifecycle: ExitBrainLifecycle;
  isExitMode: boolean;
  activatedAt: string | null;
  noticeGivenDate: string | null;
  expectedCheckoutDate: string | null;
  timeline: ExitTimelineEvent[];
  checklist: ExitChecklistItem[];
  frozen: {
    noticePenaltyPaise: number;
    rentLateFeePaise: number;
  };
  outstanding: {
    rentPrincipalPaise: number;
    rentLateFeePaise: number;
    electricityInvoicePaise: number;
    penaltiesPaise: number;
    miscPaise: number;
  };
  electricity: {
    generatedInvoice: ExitElectricityGenerated | null;
    estimatedCheckout: ExitElectricityEstimated;
  };
  refundEstimate: ExitRefundEstimate;
  autoRecoverFromDeposit: boolean;
};
