'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  fixHarishDepositWallet,
  previewProductionFinancialReset,
  runProductionFinancialReset,
} from '@/src/services/productionFinancialReset';

export type FinancialResetActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function previewFinancialResetAction(): Promise<FinancialResetActionState> {
  try {
    await requireAdminPermission('deposits:write');
    const preview = await previewProductionFinancialReset();
    return {
      status: 'ok',
      message:
        `Would remove ${preview.assignmentLedgerRows} assignment ledger rows (₹${preview.assignmentLedgerPaise / 100}), ` +
        `cancel ${preview.unpaidRentInvoices} unpaid rent, ` +
        `${preview.unpaidElectricityInvoices} electricity, ` +
        `${preview.unpaidFinancialInvoices} financial invoices, ` +
        `and run test-data cleanup (${preview.testCleanup.testCustomers.length} test customers).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Preview failed.',
    };
  }
}

export async function runFinancialResetAction(): Promise<FinancialResetActionState> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const result = await runProductionFinancialReset();
    revalidatePath('/admin');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/overview');
    return {
      status: 'ok',
      message:
        `Reset complete. Removed ${result.removedAssignmentLedgerIds.length} assignment ledger rows, ` +
        `cancelled ${result.cancelledRentInvoiceIds.length} rent + ` +
        `${result.cancelledElectricityInvoiceIds.length} electricity + ` +
        `${result.cancelledFinancialInvoiceIds.length} financial invoices. ` +
        `Test bookings marked: ${result.markedBookingIds.length}.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Reset failed.',
    };
  }
}

export async function fixHarishDepositAction(): Promise<FinancialResetActionState> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const result = await fixHarishDepositWallet(session.adminId);
    if (!result.ok) return { status: 'error', message: result.error };

    revalidatePath('/admin/deposits');
    revalidatePath(`/admin/deposits/${result.bookingId}`);
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/requests');

    return {
      status: 'ok',
      message:
        `${result.customerName} (${result.bookingCode}): deposit ₹${result.collectedPaise / 100}, ` +
        `deduction ₹${result.deductionPaise / 100}, refundable ₹${result.balancePaise / 100}.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Harish correction failed.',
    };
  }
}
