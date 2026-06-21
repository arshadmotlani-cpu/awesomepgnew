import { revalidatePath } from 'next/cache';

/** Invalidate all admin views that show financial totals after ledger changes. */
export function revalidateFinancialViews() {
  try {
    revalidatePath('/admin/overview');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/collections');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/deposits/collected');
    revalidatePath('/admin/invoices');
    revalidatePath('/admin/analytics');
    revalidatePath('/admin/residents');
    revalidatePath('/admin/operations');
  } catch {
    // No-op outside Next.js request context (CLI repair scripts, cron workers).
  }
}
