'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  applyBulkPgPricing,
  previewBulkPgPricing,
  type BulkPgPricingPreview,
} from '@/src/services/bulkPgPricing';

export async function previewBulkPgPricingAction(input: {
  pgId: string;
  rentPercentChange?: number | null;
  depositPercentChange?: number | null;
}): Promise<{ ok: true; preview: BulkPgPricingPreview } | { ok: false; error: string }> {
  try {
    const session = await requireAdminSession();
    const preview = await previewBulkPgPricing(session, input);
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function applyBulkPgPricingAction(input: {
  pgId: string;
  rentPercentChange?: number | null;
  depositPercentChange?: number | null;
  reason?: string;
  confirmation: string;
}): Promise<
  | { ok: true; revisionId: string; bedsUpdated: number }
  | { ok: false; error: string }
> {
  try {
    const session = await requireAdminSession();
    const result = await applyBulkPgPricing(session, input);
    revalidatePath(`/admin/pgs/${input.pgId}/pricing`);
    revalidatePath('/admin/pricing');
    return { ok: true, revisionId: result.revisionId, bedsUpdated: result.bedsUpdated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
