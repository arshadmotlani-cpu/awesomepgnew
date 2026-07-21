/**
 * Next.js path revalidation + Redis cache bust for public PG browse surfaces.
 */
import { revalidatePath } from 'next/cache';
import { invalidatePublicPgCache } from '@/src/lib/cache/invalidate';

export function revalidatePublicPgBrowseCache(input?: {
  pgSlug?: string | null;
  pgId?: string | null;
}): void {
  try {
    revalidatePath('/');
    revalidatePath('/pgs');
    if (input?.pgSlug) {
      revalidatePath(`/pgs/${input.pgSlug}`);
    }
  } catch {
    // CLI / scripts
  }
  void invalidatePublicPgCache(input);
}
