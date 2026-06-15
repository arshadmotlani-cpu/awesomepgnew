'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  cancelPendingRentInvoicesForMonth,
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

function revalidateBillingPaths() {
  revalidatePath('/admin/collections');
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/rent');
}

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
  const forceAll = formData.get('forceAll') === '1';
  const bookingIdsRaw = String(formData.get('bookingIds') ?? '').trim();
  const bookingIds = bookingIdsRaw
    ? bookingIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(billingMonth)) {
    return { status: 'error', message: 'Invalid billing month.' };
  }
  try {
    const result = await generateRentInvoicesForMonth({
      billingMonth,
      forceAll,
      bookingIds,
      asOf: forceAll ? undefined : new Date(),
    });
    revalidateBillingPaths();
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

export async function generateDueInvoicesAction(
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
    const result = await generateRentInvoicesForMonth({ billingMonth, asOf: new Date() });
    revalidateBillingPaths();
    return {
      status: 'ok',
      message: `Auto-generated ${result.invoicesCreated} invoice(s) for tenants past check-in (skipped ${result.invoicesSkipped}).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cancelPendingInvoicesAction(
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
    const result = await cancelPendingRentInvoicesForMonth(
      billingMonth,
      'Admin cancelled pending rent invoices for this month',
    );
    revalidateBillingPaths();
    const errNote =
      result.errors.length > 0 ? ` (${result.errors.length} errors)` : '';
    return {
      status: 'ok',
      message: `Cancelled ${result.cancelled} pending/overdue invoice(s)${errNote}.`,
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
    revalidateBillingPaths();
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
