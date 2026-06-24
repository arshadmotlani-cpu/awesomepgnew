'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import type { SidebarLayoutEntryInput } from '@/src/lib/admin/sidebarModules';
import { saveSidebarLayout } from '@/src/services/sidebarLayouts';

export async function persistSidebarLayoutAction(
  entries: SidebarLayoutEntryInput[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminSession('/admin');
    const scope = session.role === 'super_admin' ? 'global' : 'personal';
    await saveSidebarLayout(session, scope, entries);
    revalidatePath('/admin', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}
