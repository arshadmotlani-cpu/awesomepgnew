'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { createElectricityBill } from '@/src/services/electricityBilling';

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'duplicate'; existingBillId: string };

export async function createElectricityBillAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('electricity:write');
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }

  const roomId = String(formData.get('roomId') ?? '');
  const billingMonth = String(formData.get('billingMonth') ?? '');
  const previousReadingUnits = Number(formData.get('previousReadingUnits') ?? '');
  const currentReadingUnits = Number(formData.get('currentReadingUnits') ?? '');
  const ratePerUnitInr = Number(formData.get('ratePerUnitInr') ?? '');
  const notes = String(formData.get('notes') ?? '');

  if (!roomId) return { status: 'error', message: 'Pick a room.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billingMonth))
    return { status: 'error', message: 'Billing month must be YYYY-MM-01.' };
  if (!Number.isFinite(previousReadingUnits) || previousReadingUnits < 0)
    return { status: 'error', message: 'Previous reading must be ≥ 0.' };
  if (!Number.isFinite(currentReadingUnits) || currentReadingUnits < 0)
    return { status: 'error', message: 'Current reading must be ≥ 0.' };
  if (currentReadingUnits < previousReadingUnits)
    return {
      status: 'error',
      message: 'Current reading must be ≥ previous reading.',
    };
  if (!Number.isFinite(ratePerUnitInr) || ratePerUnitInr < 0)
    return { status: 'error', message: 'Rate must be ≥ 0.' };

  const result = await createElectricityBill({
    roomId,
    billingMonth,
    previousReadingUnits,
    currentReadingUnits,
    ratePerUnitPaise: Math.round(ratePerUnitInr * 100),
    notes: notes || null,
    createdByAdminId: admin.adminId,
    useProRataByActiveDays: true,
  });
  if (!result.ok) {
    if (result.kind === 'already_exists') {
      return { status: 'duplicate', existingBillId: result.existingBillId };
    }
    if (result.kind === 'invalid_input') {
      return { status: 'error', message: result.message };
    }
    if (result.kind === 'no_such_room') {
      return { status: 'error', message: 'That room no longer exists.' };
    }
    return { status: 'error', message: 'Failed to create bill.' };
  }
  revalidatePath('/admin/electricity');
  redirect('/admin/electricity');
}
