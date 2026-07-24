/**
 * Notice deduction — uses BillingCoverageModel SSOT for paid periods and notice breakdown.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  computeNoticeDeductionBreakdown,
  type NoticeDeductionBreakdown,
  type PaidRentCoveragePeriod,
} from '@/src/lib/vacating/noticeDeductionEngine';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';

export type { NoticeDeductionBreakdown, PaidRentCoveragePeriod };

export async function computeNoticeDeductionForBooking(input: {
  bookingId: string;
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaise: number;
  stayType?: string | null;
  durationMode?: string | null;
}): Promise<NoticeDeductionBreakdown> {
  const applies =
    input.stayType != null || input.durationMode != null
      ? noticeDeductionAppliesToBooking({
          stayType: input.stayType,
          durationMode: input.durationMode,
        })
      : true;

  if (!applies) {
    return computeNoticeDeductionBreakdown({
      monthlyRentPaise: 0,
      noticeGivenDate: input.noticeGivenDate,
      vacatingDate: input.vacatingDate,
      paidRentPeriods: [],
    });
  }

  let stayType = input.stayType;
  let durationMode = input.durationMode;
  if (stayType == null && durationMode == null) {
    const [booking] = await db
      .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    stayType = booking?.stayType;
    durationMode = booking?.durationMode;
    if (
      !noticeDeductionAppliesToBooking({
        stayType,
        durationMode,
      })
    ) {
      return computeNoticeDeductionBreakdown({
        monthlyRentPaise: 0,
        noticeGivenDate: input.noticeGivenDate,
        vacatingDate: input.vacatingDate,
        paidRentPeriods: [],
      });
    }
  }

  const coverage = await loadBillingCoverageModel({
    bookingId: input.bookingId,
    vacatingDate: input.vacatingDate,
    noticeGivenDate: input.noticeGivenDate,
    monthlyRentPaise: input.monthlyRentPaise,
    stayType,
    durationMode,
  });

  if (coverage?.noticeBreakdown) {
    return coverage.noticeBreakdown;
  }

  return computeNoticeDeductionBreakdown({
    monthlyRentPaise: input.monthlyRentPaise,
    noticeGivenDate: input.noticeGivenDate,
    vacatingDate: input.vacatingDate,
    paidRentPeriods: coverage?.paidInvoiceCoverage ?? [],
    billingDay: coverage?.billingDay ?? 5,
  });
}
