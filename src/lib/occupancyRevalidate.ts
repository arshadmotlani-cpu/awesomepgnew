import { revalidatePath } from 'next/cache';

/** Invalidate admin views that show bed occupancy / availability after reservation changes. */
export function revalidateOccupancyViews() {
  revalidatePath('/admin/overview');
  revalidatePath('/admin/operations');
  revalidatePath('/admin/pgs');
  revalidatePath('/admin/residents');
  revalidatePath('/admin/beds');
  revalidatePath('/admin/bookings');
}
