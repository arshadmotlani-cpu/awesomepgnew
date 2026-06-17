'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { recordAdvanceDeposit } from '@/src/services/deposits';

export async function recordAdvanceDepositAction(input: {
  bookingId: string;
  customerId: string;
  amountInr: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    await recordAdvanceDeposit({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise,
      createdByAdminId: session.adminId,
      note: input.note,
    });

    revalidatePath('/admin/deposits');
    revalidatePath('/admin/deposits/advance');
    revalidatePath(`/admin/deposits/${input.bookingId}`);
    revalidatePath(`/admin/residents/${input.customerId}`);
    revalidatePath('/admin/revenue');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not record deposit.' };
  }
}
