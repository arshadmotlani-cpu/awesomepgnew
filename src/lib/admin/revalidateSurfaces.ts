/**
 * Revalidate admin surfaces after domain writes so counters stay live without Sync button.
 */
import { revalidatePath } from 'next/cache';

const ADMIN_PATHS = [
  '/admin',
  '/admin/overview',
  '/admin/operations',
  '/admin/revenue',
  '/admin/collections',
  '/admin/billing',
  '/admin/vacating',
  '/admin/checkout-settlements',
  '/admin/residents',
  '/admin/residents/kyc',
  '/admin/notifications',
] as const;

export function revalidateAdminSurfaces(): void {
  try {
    for (const path of ADMIN_PATHS) {
      revalidatePath(path);
    }
  } catch {
    // No-op outside Next.js request context (CLI scripts).
  }
}
