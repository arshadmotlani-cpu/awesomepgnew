'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';

export type CleanupActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function cleanupOperatorTestDataAction(
  _prev: CleanupActionState,
  _formData: FormData,
): Promise<CleanupActionState> {
  await requireAdminSession('/admin/settings');

  try {
    const result = await runOperatorTestDataCleanup();
    revalidatePath('/admin');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/settings');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/pgs');

    const parts: string[] = [];
    if (result.cancelledBookingIds.length > 0) {
      parts.push(`cancelled ${result.cancelledBookingIds.length} test booking(s)`);
    }
    if (result.removedDeductionIds.length > 0) {
      parts.push(
        `removed ${result.removedDeductionIds.length} June deposit deduction(s) (₹${result.removedDeductionPaise / 100})`,
      );
    }
    if (parts.length === 0) {
      return { status: 'ok', message: 'Nothing to clean up — overview should already be clear.' };
    }
    return { status: 'ok', message: `Done: ${parts.join('; ')}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cleanup failed';
    return { status: 'error', message };
  }
}
