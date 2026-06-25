'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  retryAllFailuresForRun,
  retryBillingGenerationFailure,
} from '@/src/services/billingScheduler';

export type BillingActionState = { ok: boolean; error?: string; resolved?: number };

export async function retryBillingFailureAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    await requireAdminPermission('rent:write');
    const failureId = formData.get('failureId')?.toString();
    if (!failureId) return { ok: false, error: 'Missing failure id' };
    const result = await retryBillingGenerationFailure(failureId);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/admin/billing');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function retryBillingRunAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    await requireAdminPermission('rent:write');
    const runId = formData.get('runId')?.toString();
    if (!runId) return { ok: false, error: 'Missing run id' };
    const result = await retryAllFailuresForRun(runId);
    revalidatePath('/admin/billing');
    return { ok: true, resolved: result.resolved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
