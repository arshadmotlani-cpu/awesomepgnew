import { revalidatePath } from 'next/cache';

const PG_ADMIN_SECTIONS = ['listing', 'rooms', 'collections', 'edit'] as const;

/** Revalidate all PG setup pages after inventory, payments, or listing changes. */
export function revalidatePgAdminPages(pgId: string) {
  for (const section of PG_ADMIN_SECTIONS) {
    revalidatePath(`/admin/pgs/${pgId}/${section}`);
  }
}
