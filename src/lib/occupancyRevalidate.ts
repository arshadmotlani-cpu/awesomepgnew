import { revalidatePath } from 'next/cache';

/** Invalidate admin views that show bed occupancy / availability after reservation changes. */
export function revalidateOccupancyViews(pgId?: string | null) {
  try {
    revalidatePath('/admin/overview');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/pgs');
    revalidatePath('/admin/residents', 'layout');
    revalidatePath('/admin/beds', 'layout');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/quick-actions');
    if (pgId) {
      revalidatePath(`/admin/pgs/${pgId}/map`);
    }
  } catch {
    // No-op outside Next.js request context (CLI repair scripts, cron workers).
  }
}
