'use server';

import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBooking } from '@/src/lib/auth/guards';
import {
  buildResidentMoveOutRequestPreview,
  type ResidentMoveOutRequestPreview,
} from '@/src/lib/vacating/residentMoveOutRequestPreview';

export type MoveOutPreviewActionResult =
  | { ok: true; preview: ResidentMoveOutRequestPreview }
  | { ok: false; error: string };

export async function previewMoveOutSettlementAction(input: {
  bookingId: string;
  vacatingDate: string;
  monthlyRentPaise?: number;
}): Promise<MoveOutPreviewActionResult> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  try {
    await requireCustomerOwnsBooking(session, input.bookingId);
  } catch {
    return { ok: false, error: 'Access denied.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vacatingDate)) {
    return { ok: false, error: 'Invalid move-out date.' };
  }

  const preview = await buildResidentMoveOutRequestPreview({
    bookingId: input.bookingId,
    vacatingDate: input.vacatingDate,
    noticeGivenDate: new Date().toISOString().slice(0, 10),
    monthlyRentPaiseSnapshot: input.monthlyRentPaise,
  });

  if (!preview) {
    return { ok: false, error: 'Could not calculate move-out preview.' };
  }

  return { ok: true, preview };
}
