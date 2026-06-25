/**
 * Customer-facing booking policies — SSOT by stay type.
 * Every surface (review, invoice, confirmation) should call getBookingPolicies().
 */

import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import {
  DEFAULT_POLICY,
  SHORT_STAY_POLICY,
  formatCancellationPolicyCustomerCopy,
  type CancellationPolicy,
} from '@/src/services/cancellationPolicy';
import type { StayType } from '@/src/lib/stayType';

export type PolicySection = {
  title: string;
  body: string;
};

export type MonthlyBookingPolicies = {
  stayType: 'monthly_stay';
  noticePolicy: PolicySection;
  cancellationPolicy: PolicySection;
};

export type FixedDateBookingPolicies = {
  stayType: 'fixed_date_stay';
  stayPeriodPolicy: PolicySection;
  cancellationPolicy: PolicySection;
};

export type BookingPolicies = MonthlyBookingPolicies | FixedDateBookingPolicies;

export function getCancellationPolicyForStayType(stayType: StayType): CancellationPolicy {
  return stayType === 'monthly_stay' ? DEFAULT_POLICY : SHORT_STAY_POLICY;
}

export function getBookingPolicies(stayType: 'monthly_stay'): MonthlyBookingPolicies;
export function getBookingPolicies(stayType: 'fixed_date_stay'): FixedDateBookingPolicies;
export function getBookingPolicies(stayType: StayType): BookingPolicies;
export function getBookingPolicies(stayType: StayType): BookingPolicies {
  if (stayType === 'monthly_stay') {
    return {
      stayType: 'monthly_stay',
      noticePolicy: {
        title: 'Notice period',
        body: `${VACATING_NOTICE_MIN_DAYS}-day notice required before moving out. Submit a move-out request when you decide to leave.`,
      },
      cancellationPolicy: {
        title: 'Cancellation',
        body: formatCancellationPolicyCustomerCopy(DEFAULT_POLICY, 'monthly'),
      },
    };
  }

  return {
    stayType: 'fixed_date_stay',
    stayPeriodPolicy: {
      title: 'Stay period',
      body:
        'Your booking automatically ends on your selected checkout date. ' +
        'No move-out request or notice period is required unless you wish to extend your stay.',
    },
    cancellationPolicy: {
      title: 'Cancellation',
      body: formatCancellationPolicyCustomerCopy(SHORT_STAY_POLICY, 'fixed_date'),
    },
  };
}

/** Ordered policy blocks for rendering (notice OR stay period, then cancellation). */
export function bookingPolicySections(policies: BookingPolicies): PolicySection[] {
  if (policies.stayType === 'monthly_stay') {
    return [policies.noticePolicy, policies.cancellationPolicy];
  }
  return [policies.stayPeriodPolicy, policies.cancellationPolicy];
}

/** Invoice / PDF footnote for stay rules — null when not applicable. */
export function getInvoiceStayPolicyNote(stayType: StayType): string | null {
  const policies = getBookingPolicies(stayType);
  if (policies.stayType === 'monthly_stay') {
    return policies.noticePolicy.body;
  }
  return policies.stayPeriodPolicy.body;
}

export function durationModeToStayType(durationMode: string | null | undefined): StayType {
  return durationMode === 'open_ended' ? 'monthly_stay' : 'fixed_date_stay';
}
