'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { recordAdvanceDeposit } from '@/src/services/deposits';
import { resolveBookingIdForCustomer } from '@/src/services/residentAdmin';

export async function recordAdvanceDepositAction(input: {
  bookingId?: string | null;
  customerId: string;
  amountInr: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const bookingId =
      input.bookingId ?? (await resolveBookingIdForCustomer(input.customerId));
    if (!bookingId) {
      return {
        ok: false,
        error: 'No booking found — create a booking or assign a bed first.',
      };
    }

    await recordAdvanceDeposit({
      bookingId,
      customerId: input.customerId,
      amountPaise,
      createdByAdminId: session.adminId,
      note: input.note,
    });

    revalidatePath('/admin/deposits');
    revalidatePath('/admin/deposits/advance');
    revalidatePath(`/admin/deposits/${bookingId}`);
    revalidatePath(`/admin/residents/${input.customerId}`);
    revalidatePath('/admin/revenue');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not record deposit.' };
  }
}
