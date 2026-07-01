/**
 * Revalidate all surfaces that display pricing after admin rate changes.
 */

import { revalidatePath } from 'next/cache';

export function revalidatePricingViews(pgSlug?: string) {
  try {
    revalidatePath('/pgs');
    if (pgSlug) {
      revalidatePath(`/pgs/${pgSlug}`);
      revalidatePath(`/pgs/${pgSlug}`, 'page');
    }
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
}
