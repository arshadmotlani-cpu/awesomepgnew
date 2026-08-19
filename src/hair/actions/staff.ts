'use server';

import { revalidatePath } from 'next/cache';
import { HairPermissionError } from '@/src/hair/lib/auth/permissions';
import { requireStaffManagementAccess } from '@/src/hair/lib/auth/staffManagementAccess';
import { createStaffQuick } from '@/src/hair/services/staff';

export type StaffActionState = {
  error?: string;
  success?: string;
};

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function createStaffQuickAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  try {
    const access = await requireStaffManagementAccess();
    if (!access.canAdd) throw new HairPermissionError('Missing permission: staff.add');
    await createStaffQuick({
      fullName: formStr(formData, 'fullName'),
      phone: formStr(formData, 'phone') || null,
      role: formStr(formData, 'role') || null,
    });
    revalidatePath('/staff');
    revalidatePath('/services');
    return { success: 'Staff member added.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add staff' };
  }
}
