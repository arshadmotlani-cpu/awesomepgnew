/**
 * Revalidate all surfaces that display pricing after admin rate changes.
 */

import { revalidatePath } from 'next/cache';
import { invalidateAdminKpiCache } from '@/src/lib/cache/invalidate';
import { revalidatePublicPgBrowseCache } from '@/src/lib/cache/revalidatePublicPg';

export function revalidatePricingViews(pgSlug?: string, opts?: { pgId?: string }) {
  revalidatePublicPgBrowseCache({ pgSlug, pgId: opts?.pgId });
  try {
    revalidatePath('/booking/new');
    revalidatePath('/account');
    revalidatePath('/admin/overview');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/collections');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/invoices');
    revalidatePath('/admin/pricing');
    revalidatePath('/admin/pgs');
    revalidatePath('/admin/residents');
  } catch {
    // No-op outside Next.js request context (CLI remediation scripts).
  }
  void invalidateAdminKpiCache();
}
