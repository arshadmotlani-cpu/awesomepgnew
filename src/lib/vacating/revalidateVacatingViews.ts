import { revalidatePath } from 'next/cache';
import { resolvePgIdForBooking } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';

export type VacatingLifecycleRevalidateContext = {
  customerId?: string;
  bookingId?: string;
  pgId?: string;
};

const ADMIN_LAYOUT_PATHS = [
  '/admin/vacating',
  '/admin/requests',
  '/admin/actions',
  '/admin/checkout-settlements',
  '/admin/pgs',
  '/admin/overview',
  '/admin/operations',
  '/admin/residents',
  '/admin/deposits',
  '/admin/rent',
  '/admin/electricity',
  '/admin/bookings',
  '/admin/beds',
  '/admin',
  '/admin/panel',
] as const;

/** Invalidate admin + finance views after vacate/refund lifecycle changes. */
export function revalidateVacatingLifecycleViews(ctx?: VacatingLifecycleRevalidateContext) {
  for (const path of ADMIN_LAYOUT_PATHS) {
    revalidatePath(path, 'layout');
  }
  revalidateOccupancyViews();
  revalidateFinancialViews();
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/collections');
  revalidatePath('/admin/analytics');
  revalidatePath('/admin/invoices');
  revalidatePath('/pgs');

  if (ctx?.customerId) {
    revalidatePath(`/admin/residents/${ctx.customerId}`);
  }
  if (ctx?.bookingId) {
    revalidatePath(`/admin/bookings/${ctx.bookingId}`);
    revalidatePath(`/admin/bookings/${ctx.bookingId}/financial`);
    revalidatePath(`/admin/deposits/${ctx.bookingId}`);
  }
  if (ctx?.pgId) {
    revalidatePath(`/admin/pgs/${ctx.pgId}/map`);
  }
}

export async function revalidateVacatingLifecycleForBooking(
  bookingId: string,
  customerId?: string,
): Promise<void> {
  const pgId = await resolvePgIdForBooking(bookingId);
  revalidateVacatingLifecycleViews({
    bookingId,
    customerId,
    pgId: pgId ?? undefined,
  });
}
