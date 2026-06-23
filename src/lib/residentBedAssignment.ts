export type ResidentTenancyStatus =
  | 'unassigned'
  | 'active'
  | 'vacating'
  | 'vacated'
  | 'blocked';

/** Minimal bed-assignment fields shared by residents list, search, and ops queues. */
export type ResidentBedContext = {
  tenancyStatus?: ResidentTenancyStatus | null;
  bedId?: string | null;
  bookingId?: string | null;
};

export type ResidentBedAssignmentContext = ResidentBedContext & {
  onboardingBookingId?: string | null;
  onboardingBookingStatus?: string | null;
  onboardingPaymentApproved?: boolean;
};

const INACTIVE_BOOKING_STATUSES = new Set([
  'cancelled',
  'completed',
  'refunded',
  'draft',
  'pending_payment',
]);

/** True when the resident has a confirmed primary reservation (today or upcoming). */
export function isResidentBedAssigned(ctx: ResidentBedContext): boolean {
  if (ctx.bedId && ctx.bookingId) return true;
  return ctx.tenancyStatus === 'active' || ctx.tenancyStatus === 'vacating';
}

export function isResidentBedAssignable(ctx: ResidentBedContext): boolean {
  if (ctx.tenancyStatus === 'blocked' || ctx.tenancyStatus === 'vacated') return false;
  return !isResidentBedAssigned(ctx);
}

/**
 * Booking is eligible for bed assignment when confirmed, or pending admin approval
 * after payment proof / deposit collection (see bookingApproval lifecycle).
 */
export function isOnboardingBookingEligibleForBedAssignment(input: {
  bookingStatus?: string | null;
  paymentApproved?: boolean;
}): boolean {
  const status = input.bookingStatus?.trim();
  if (!status || INACTIVE_BOOKING_STATUSES.has(status)) return false;
  if (status === 'confirmed') return true;
  if (status === 'pending_approval') return Boolean(input.paymentApproved);
  return false;
}

/**
 * Operations "Assign bed" queue — requires active onboarding with approved booking
 * path and no bed assigned yet. Excludes former/vacated/cancelled residents.
 */
export function isResidentBedAssignmentEligible(ctx: ResidentBedAssignmentContext): boolean {
  if (!isResidentBedAssignable(ctx)) return false;
  if (!ctx.onboardingBookingId) return false;
  return isOnboardingBookingEligibleForBedAssignment({
    bookingStatus: ctx.onboardingBookingStatus,
    paymentApproved: ctx.onboardingPaymentApproved,
  });
}

export function assignedBedShortLabel(ctx: {
  roomNumber?: string | null;
  bedCode?: string | null;
}): string | null {
  if (!ctx.roomNumber && !ctx.bedCode) return null;
  const parts = [
    ctx.roomNumber ? `Room ${ctx.roomNumber}` : null,
    ctx.bedCode ?? null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function viewBedAdminHref(input: {
  pgId?: string | null;
  bedId?: string | null;
}): string | null {
  if (!input.pgId || !input.bedId) return null;
  return `/admin/beds?pgId=${input.pgId}&bedId=${input.bedId}`;
}
