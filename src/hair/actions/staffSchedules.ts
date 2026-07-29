'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { saveStaffDaySchedule } from '@/src/hair/services/staffSchedules';

export type ScheduleActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function saveStaffDayScheduleAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    await requireHairAuth();
    const staffId = formStr(formData, 'staffId');
    const dayOfWeek = Number(formStr(formData, 'dayOfWeek'));
    if (!staffId || Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return { error: 'Invalid schedule input.' };
    }
    const isOff = formStr(formData, 'isOff') === '1';
    const startTime = formStr(formData, 'startTime') || '10:00';
    const endTime = formStr(formData, 'endTime') || '19:00';
    await saveStaffDaySchedule({ staffId, dayOfWeek, startTime, endTime, isOff });
    revalidatePath('/staff');
    revalidatePath('/dashboard');
    revalidatePath('/appointments');
    return { success: 'Schedule saved.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save schedule' };
  }
}
