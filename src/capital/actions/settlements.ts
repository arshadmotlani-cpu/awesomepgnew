'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { createSettlement } from '@/src/capital/services/settlements';
export type ActionState = { error?: string; success?: string };

export async function createSettlementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const assetId = String(formData.get('assetId') ?? '');
    const notes = String(formData.get('notes') ?? '').trim() || undefined;
    if (!assetId) return { error: 'Asset is required.' };
    await createSettlement(assetId, notes);
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Asset settled.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to settle' };
  }
}
