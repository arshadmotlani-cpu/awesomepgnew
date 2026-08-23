'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import type { SidebarLayoutEntryInput } from '@/src/lib/admin/sidebarModules';
import { saveSidebarLayout } from '@/src/services/sidebarLayouts';

/**
 * Persist sidebar order for the acting admin.
 *
 * Always writes **personal** so the drag sticks for the current admin
 * (resolve prefers personal over global). Super admins also update **global**
 * so their order becomes the org default for admins without a personal layout.
 */
export async function persistSidebarLayoutAction(
  entries: SidebarLayoutEntryInput[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminSession('/admin');
    await saveSidebarLayout(session, 'personal', entries);
    if (session.role === 'super_admin') {
      await saveSidebarLayout(session, 'global', entries);
    }
    revalidatePath('/admin', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}
