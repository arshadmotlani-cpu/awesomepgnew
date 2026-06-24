'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import type { SidebarLayoutEntryInput } from '@/src/lib/admin/sidebarModules';
import type { SidebarLayoutType } from '@/src/db/schema/enums';
import {
  resetGlobalSidebarLayout,
  resetPersonalSidebarLayout,
  saveSidebarLayout,
} from '@/src/services/sidebarLayouts';

export type SidebarLayoutActionState = {
  ok: boolean;
  message?: string;
};

function revalidateSidebarSurfaces() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/settings/sidebar-layout');
}

export async function saveSidebarLayoutAction(
  scope: SidebarLayoutType,
  entries: SidebarLayoutEntryInput[],
): Promise<SidebarLayoutActionState> {
  try {
    const session = await requireAdminSession('/admin/settings/sidebar-layout');
    if (scope === 'global' && session.role !== 'super_admin') {
      return { ok: false, message: 'Only Super Admin can save the global layout.' };
    }
    await saveSidebarLayout(session, scope, entries);
    revalidateSidebarSurfaces();
    return {
      ok: true,
      message: scope === 'global' ? 'Global sidebar layout saved.' : 'Personal sidebar layout saved.',
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function resetPersonalSidebarLayoutAction(): Promise<SidebarLayoutActionState> {
  try {
    const session = await requireAdminSession('/admin/settings/sidebar-layout');
    await resetPersonalSidebarLayout(session);
    revalidateSidebarSurfaces();
    return { ok: true, message: 'Personal layout reset — using global/default order.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Reset failed.' };
  }
}

export async function resetGlobalSidebarLayoutAction(): Promise<SidebarLayoutActionState> {
  try {
    const session = await requireAdminSession('/admin/settings/sidebar-layout');
    if (session.role !== 'super_admin') {
      return { ok: false, message: 'Only Super Admin can reset the global layout.' };
    }
    await resetGlobalSidebarLayout(session);
    revalidateSidebarSurfaces();
    return { ok: true, message: 'Global layout reset to system defaults.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Reset failed.' };
  }
}
