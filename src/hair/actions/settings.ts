'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import type { FyhBusinessHoursDay } from '@/src/hair/db/schema/settings';
import { updateSalonSettings } from '@/src/hair/services/settings';

export type SettingsActionState = { error?: string; success?: string };

function formStr(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export async function saveSalonSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requireHairAuth();

    const businessHours: FyhBusinessHoursDay[] = DAY_NAMES.map((_, dayOfWeek) => {
      const closed = formData.get(`closed_${dayOfWeek}`) === 'on';
      return {
        dayOfWeek,
        open: formStr(formData, `open_${dayOfWeek}`) || '10:00',
        close: formStr(formData, `close_${dayOfWeek}`) || '20:00',
        closed,
      };
    });

    const gstPercent = Number(formStr(formData, 'defaultGstPercent') || '18');
    await updateSalonSettings({
      businessName: formStr(formData, 'businessName'),
      businessAddress: formStr(formData, 'businessAddress') || null,
      gstin: formStr(formData, 'gstin') || null,
      invoicePrefix: formStr(formData, 'invoicePrefix') || 'FYH',
      defaultGstBps: Math.round(gstPercent * 100),
      defaultBufferMinutes: Number(formStr(formData, 'defaultBufferMinutes') || '0'),
      timezone: formStr(formData, 'timezone') || 'Asia/Kolkata',
      businessHours,
      googleReviewUrl: formStr(formData, 'googleReviewUrl') || null,
    });
    revalidatePath('/billing');
    revalidatePath('/appointments');
    return { success: 'Settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}
