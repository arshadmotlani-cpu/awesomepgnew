'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { recordManualElectricityCredit } from '@/src/services/roomElectricityLedger';

export async function recordManualElectricityCreditAction(input: {
  roomId: string;
  billingMonth: string;
  residentKey: string;
  amountInr: number;
  source: 'manual' | 'cash' | 'upi';
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminPermission('electricity:write');

  const [customerId, bookingId] = input.residentKey.split('|');
  if (!input.roomId || !input.billingMonth || !customerId || !bookingId) {
    return { ok: false, error: 'Room, month, resident, and booking are required.' };
  }
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  await recordManualElectricityCredit({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    customerId,
    bookingId,
    amountPaise: Math.round(input.amountInr * 100),
    source: input.source,
    note: input.note || null,
  });

  revalidatePath('/admin/electricity/ledger');
  revalidatePath('/admin/electricity/bills');
  revalidatePath('/admin/billing');

  return { ok: true };
}
