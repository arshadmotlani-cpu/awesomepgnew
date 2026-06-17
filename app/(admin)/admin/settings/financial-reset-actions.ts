'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  previewFullFinancialCleanStart,
  runFullFinancialCleanStart,
} from '@/src/services/fullFinancialCleanStart';
import { fixHarishDepositWallet } from '@/src/services/productionFinancialReset';

export type FinancialResetActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function previewFinancialResetAction(): Promise<FinancialResetActionState> {
  try {
    await requireAdminPermission('deposits:write');
    const preview = await previewFullFinancialCleanStart();
    return {
      status: 'ok',
      message:
        `Full clean start will wipe: ${preview.depositLedgerRows} ledger rows, ` +
        `${preview.rentInvoices} rent invoices, ${preview.electricityInvoices} electricity invoices, ` +
        `${preview.financialInvoices} financial invoices, ${preview.pgPaymentRecords} payment records, ` +
        `${preview.payments} payments, ${preview.openActionItems} billing action items. ` +
        `All dashboard KPIs will read ₹0.`,
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
    const result = await runFullFinancialCleanStart(session);

    revalidatePath('/admin');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/overview');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/residents');
    revalidatePath('/admin/requests');
    revalidatePath('/admin/collections');

    return {
      status: 'ok',
      message:
        `Full financial clean start complete. Cleared ${result.depositLedgerRows} ledger rows, ` +
        `cancelled ${result.rentInvoices} rent + ${result.electricityInvoices} electricity + ` +
        `${result.financialInvoices} financial invoices, removed ${result.pgPaymentRecords} payment records, ` +
        `reset ${result.bookingsReset} bookings. All metrics are now zero — enter real data manually.`,
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
