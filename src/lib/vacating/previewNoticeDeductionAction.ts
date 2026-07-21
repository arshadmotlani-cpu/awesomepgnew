'use server';

import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBooking } from '@/src/lib/auth/guards';
import { todayString } from '@/src/lib/dates';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';

export type NoticeDeductionPreviewResult =
  | { ok: true; breakdown: NoticeDeductionBreakdown }
  | { ok: false; error: string };

async function previewNoticeDeductionCore(input: {
  bookingId: string;
  vacatingDate: string;
  noticeGivenDate?: string;
  monthlyRentPaise: number;
}): Promise<NoticeDeductionPreviewResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vacatingDate)) {
    return { ok: false, error: 'Invalid vacating date.' };
  }
  try {
    const breakdown = await computeNoticeDeductionForBooking({
      bookingId: input.bookingId,
      vacatingDate: input.vacatingDate,
      noticeGivenDate: input.noticeGivenDate ?? todayString(),
      monthlyRentPaise: input.monthlyRentPaise,
    });
    return { ok: true, breakdown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function previewNoticeDeductionForCustomerAction(input: {
  bookingId: string;
  vacatingDate: string;
  noticeGivenDate?: string;
  monthlyRentPaise: number;
}): Promise<NoticeDeductionPreviewResult> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };
  try {
    await requireCustomerOwnsBooking(session, input.bookingId);
  } catch {
    return { ok: false, error: 'Access denied.' };
  }
  return previewNoticeDeductionCore(input);
}

export async function previewNoticeDeductionForAdminAction(input: {
  bookingId: string;
  vacatingDate: string;
  noticeGivenDate?: string;
  monthlyRentPaise: number;
}): Promise<NoticeDeductionPreviewResult> {
  const admin = await requireAdminPermission('vacating:write');
  try {
    await assertAdminBookingAccess(admin, input.bookingId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  return previewNoticeDeductionCore(input);
}
