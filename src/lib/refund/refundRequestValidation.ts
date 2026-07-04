import { isFixedStayDurationMode, isMonthlyDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import { coerceNonNegativePaise } from '@/src/lib/format';
import {
  applyDeveloperTestEligibilityOverride,
  applyDeveloperTestRefundPageOverride,
} from '@/src/lib/auth/developerTestResident.shared';
import {
  getDepositRefundEligibility,
  type DepositRefundEligibility,
} from '@/src/lib/vacating/depositRefundEligibility';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

export type RefundRequestBookingInput = {
  bookingId: string;
  bookingCode?: string | null;
  status: string;
  durationMode: string;
  expectedCheckoutDate?: string | null;
  /** Server serializes Date props to ISO strings on the client. */
  createdAt?: Date | string | null;
  refundableBalancePaise: number;
  monthlyRentPaise?: number;
};

export type RefundRequestSettlementInput = {
  status: string;
  rejectionReason?: string | null;
  checkoutSource?: string | null;
} | null;

export type RefundRequestPageModel = {
  bookingId: string;
  bookingCode: string | null;
  durationMode: string;
  stayKind: 'monthly' | 'fixed_stay' | 'unknown';
  refundableBalancePaise: number;
  estimatedDeductionPaise: number;
  eligibility: DepositRefundEligibility;
  rejectionReason: string | null;
  missingRequirements: string[];
  canRenderForm: boolean;
  blockedMessage: string | null;
};

function normalizeCreatedAt(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function stayKind(durationMode: string): RefundRequestPageModel['stayKind'] {
  if (isFixedStayDurationMode(durationMode)) return 'fixed_stay';
  if (isMonthlyDurationMode(durationMode)) return 'monthly';
  return 'unknown';
}

/** Validates refund page inputs and derives a safe render model — never throws. */
export function buildRefundRequestPageModel(input: {
  booking: RefundRequestBookingInput;
  vacating: VacatingForBookingRow | null;
  settlement: RefundRequestSettlementInput;
  developerTestEmail?: string | null;
  hasActiveBedToday?: boolean;
}): RefundRequestPageModel {
  const missingRequirements: string[] = [];
  const bookingId = input.booking.bookingId?.trim() ?? '';

  if (!bookingId) missingRequirements.push('booking');
  if (!input.booking.status?.trim()) missingRequirements.push('booking status');
  if (!input.booking.durationMode?.trim()) missingRequirements.push('stay type');

  const createdAt = normalizeCreatedAt(input.booking.createdAt);
  const durationMode = input.booking.durationMode?.trim() || 'monthly';
  const kind = stayKind(durationMode);

  if (kind === 'monthly' && !createdAt) {
    missingRequirements.push('booking start date');
  }

  const refundableBalancePaise = coerceNonNegativePaise(input.booking.refundableBalancePaise);
  const estimatedDeductionPaise = coerceNonNegativePaise(input.vacating?.deductionPaise ?? 0);

  let eligibility: DepositRefundEligibility = {
    canRequestRefund: false,
    lockReason: 'We could not verify refund eligibility yet. Please try again in a moment.',
    unlockState: 'locked',
  };

  try {
    eligibility = getDepositRefundEligibility({
      vacating: input.vacating,
      booking: createdAt
        ? {
            status: input.booking.status,
            durationMode,
            expectedCheckoutDate: input.booking.expectedCheckoutDate ?? null,
            createdAt,
          }
        : kind === 'fixed_stay' && input.booking.status
          ? {
              status: input.booking.status,
              durationMode,
              expectedCheckoutDate: input.booking.expectedCheckoutDate ?? null,
              createdAt: createdAt ?? new Date(0),
            }
          : null,
      settlement: input.settlement,
      monthlyRentPaise: coerceNonNegativePaise(input.booking.monthlyRentPaise ?? 0),
      hasActiveBedToday: input.hasActiveBedToday,
    });
  } catch {
    eligibility = {
      canRequestRefund: false,
      lockReason:
        'We could not load refund eligibility due to incomplete stay data. Please contact support if this continues.',
      unlockState: 'locked',
    };
    missingRequirements.push('refund eligibility');
  }

  eligibility = applyDeveloperTestEligibilityOverride(input.developerTestEmail, eligibility);

  const rejectionReason = input.settlement?.rejectionReason?.trim() || null;
  let blockedMessage: string | null = null;

  if (missingRequirements.length > 0) {
    blockedMessage =
      'Some required stay information is missing, so we cannot open the refund form yet. Please refresh the page or contact the PG office for help.';
  } else if (!eligibility.canRequestRefund) {
    blockedMessage = eligibility.lockReason;
  } else if (refundableBalancePaise <= 0) {
    blockedMessage =
      'No refundable deposit balance is available on this booking. If you believe this is wrong, contact the PG office.';
  }

  const canRenderFormBase =
    missingRequirements.length === 0 &&
    eligibility.canRequestRefund &&
    refundableBalancePaise > 0;

  const devOverride = applyDeveloperTestRefundPageOverride(
    input.developerTestEmail,
    canRenderFormBase,
    blockedMessage,
  );

  return {
    bookingId,
    bookingCode: input.booking.bookingCode?.trim() || null,
    durationMode,
    stayKind: kind,
    refundableBalancePaise,
    estimatedDeductionPaise,
    eligibility,
    rejectionReason,
    missingRequirements,
    canRenderForm: devOverride.canRenderForm || canRenderFormBase,
    blockedMessage: devOverride.blockedMessage ?? blockedMessage,
  };
}
