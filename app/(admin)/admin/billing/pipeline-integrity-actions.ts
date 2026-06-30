'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { repairPipelineTestMisassignments } from '@/src/services/billingPipelineIntegrity';

export type PipelineRepairActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function repairPipelineTestMisassignmentsAction(
  _prev: PipelineRepairActionState,
): Promise<PipelineRepairActionState> {
  const session = await requireAdminSession('/admin/billing');
  const result = await repairPipelineTestMisassignments(session);

  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  revalidatePath('/admin/billing');
  revalidatePath('/admin/overview');

  if (result.cancelledCount === 0) {
    return { status: 'ok', message: 'No misassigned pipeline test invoices found.' };
  }

  return {
    status: 'ok',
    message: `Cancelled ${result.cancelledCount} misassigned test invoice(s): ${result.cancelledInvoiceNumbers.join(', ')}.`,
  };
}
