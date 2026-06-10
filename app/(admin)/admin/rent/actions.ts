'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  generateRentInvoicesForMonth,
  markOverdueInvoices,
} from '@/src/services/rentInvoices';

export type ActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
    }
  | { status: 'error'; message: string };

export async function generateInvoicesAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminPermission('rent:write');
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  const billingMonth = String(formData.get('billingMonth') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billingMonth)) {
    return { status: 'error', message: 'Invalid billing month.' };
  }
  try {
    const result = await generateRentInvoicesForMonth({ billingMonth });
    revalidatePath('/admin/rent');
    return {
      status: 'ok',
      message: `Created ${result.invoicesCreated} invoice(s) (skipped ${result.invoicesSkipped}; ${result.candidateBookings} candidates).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function markOverdueAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminPermission('rent:write');
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  try {
    const result = await markOverdueInvoices();
    revalidatePath('/admin/rent');
    return {
      status: 'ok',
      message: `Flipped ${result.updated} invoice(s) to overdue.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
