'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { updateDailyClosingOpeningFloatPaise } from '@/src/hair/services/settings';

export type DailyClosingActionState = { error?: string; success?: string };

function parseOpeningFloatPaise(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error('Opening float must be a non-negative amount');
  }
  return Math.round(rupees * 100);
}

/** Save cash drawer opening float for daily closing (amount in rupees from form). */
export async function saveDailyClosingOpeningFloatAction(
  _prev: DailyClosingActionState,
  formData: FormData,
): Promise<DailyClosingActionState> {
  try {
    await requirePermission('page:dashboard');
    const paise = parseOpeningFloatPaise(String(formData.get('openingFloatRupees') ?? ''));
    await updateDailyClosingOpeningFloatPaise(paise);
    revalidatePath('/dashboard/revenue');
    return { success: 'Opening float saved for tomorrow' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save opening float' };
  }
}

/** Mark end-of-day register close — persists current cash-on-hand as next opening float. */
export async function closeDailyRegisterAction(
  _prev: DailyClosingActionState,
  formData: FormData,
): Promise<DailyClosingActionState> {
  try {
    await requirePermission('page:dashboard');
    const paise = parseOpeningFloatPaise(String(formData.get('closingCashRupees') ?? ''));
    await updateDailyClosingOpeningFloatPaise(paise);
    revalidatePath('/dashboard/revenue');
    return { success: 'Day closed · opening float updated for tomorrow' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to close register' };
  }
}
