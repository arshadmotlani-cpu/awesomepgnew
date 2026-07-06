import { env } from '@/src/lib/env';

export function reservationDraftTtlMs(): number {
  return env.RESERVATION_DRAFT_TTL_HOURS * 60 * 60 * 1000;
}

export function reservationReviewTtlMs(): number {
  return env.RESERVATION_REVIEW_TTL_HOURS * 60 * 60 * 1000;
}

export function draftExpiresAtFromNow(): Date {
  return new Date(Date.now() + reservationDraftTtlMs());
}

export function reviewExpiresAtFromNow(): Date {
  return new Date(Date.now() + reservationReviewTtlMs());
}
