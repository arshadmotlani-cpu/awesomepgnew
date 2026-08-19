'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import type { FyhBusinessHoursDay } from '@/src/hair/db/schema/settings';
import {
  updateBillingSettings,
  updateCommunicationSettings,
  updateGstInvoiceSettings,
  updateInventorySettings,
  updatePrinterSettings,
  updateSalonCoreSettings,
  updateWhatsappSettings,
} from '@/src/hair/services/settings';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';

export type SettingsActionState = { error?: string; success?: string };

function formStr(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

function formBool(fd: FormData, key: string) {
  return fd.get(key) === 'on' || fd.get(key) === 'true' || fd.get(key) === '1';
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function revalidateSettingsPaths() {
  revalidatePath('/settings');
  revalidatePath('/settings/salon');
  revalidatePath('/settings/gst-invoice');
  revalidatePath('/settings/printer');
  revalidatePath('/settings/whatsapp');
  revalidatePath('/settings/communication');
  revalidatePath('/settings/billing');
  revalidatePath('/settings/inventory');
  revalidatePath('/settings/security');
  revalidatePath('/billing');
  revalidatePath('/appointments');
  revalidatePath('/quick-sale');
}

export async function saveSalonSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();

    const businessHours: FyhBusinessHoursDay[] = DAY_NAMES.map((_, dayOfWeek) => {
      const closed = formData.get(`closed_${dayOfWeek}`) === 'on';
      return {
        dayOfWeek,
        open: formStr(formData, `open_${dayOfWeek}`) || '10:00',
        close: formStr(formData, `close_${dayOfWeek}`) || '20:00',
        closed,
      };
    });

    await updateSalonCoreSettings({
      businessName: formStr(formData, 'businessName'),
      businessAddress: formStr(formData, 'businessAddress') || null,
      defaultBufferMinutes: Number(formStr(formData, 'defaultBufferMinutes') || '0'),
      timezone: formStr(formData, 'timezone') || 'Asia/Kolkata',
      businessHours,
      googleReviewUrl: formStr(formData, 'googleReviewUrl') || null,
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'Salon settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function saveGstInvoiceSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    const gstPercent = Number(formStr(formData, 'defaultGstPercent') || '18');
    await updateGstInvoiceSettings({
      gstin: formStr(formData, 'gstin') || null,
      invoicePrefix: formStr(formData, 'invoicePrefix') || 'FYH',
      defaultGstBps: Math.round(gstPercent * 100),
      invoiceNotes: formStr(formData, 'invoiceNotes') || null,
      businessEmail: formStr(formData, 'businessEmail') || null,
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'GST & invoice settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function savePrinterSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    const width = Number(formStr(formData, 'receiptWidthMm') || '80');
    await updatePrinterSettings({
      printerSettings: {
        receiptWidthMm: width === 58 ? 58 : 80,
        autoPrint: formBool(formData, 'autoPrint'),
      },
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'Printer settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function saveWhatsappSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    await updateWhatsappSettings({
      whatsappSettings: {
        enabled: formBool(formData, 'whatsappEnabled'),
        businessPhone: formStr(formData, 'businessPhone') || null,
      },
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'WhatsApp settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function saveCommunicationSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    await updateCommunicationSettings({
      communicationSettings: {
        whatsappInvoiceTemplate: formStr(formData, 'whatsappInvoiceTemplate') || undefined,
        reviewRequestTemplate: formStr(formData, 'reviewRequestTemplate') || undefined,
      },
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'Communication templates saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function saveBillingSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    await updateBillingSettings({
      billingSettings: {
        defaultMarkDue: formBool(formData, 'defaultMarkDue'),
        defaultMarkFullDue: formBool(formData, 'defaultMarkFullDue'),
        defaultCreditOverpayAsAdvance: formBool(formData, 'defaultCreditOverpayAsAdvance'),
      },
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'Billing defaults saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}

export async function saveInventorySettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requirePermission('action:settings.edit');
    const ctx = await getTenantContextForAction();
    await updateInventorySettings({
      inventorySettings: {
        allowNegativeStock: formBool(formData, 'allowNegativeStock'),
      },
    }, ctx);
    revalidateSettingsPaths();
    return { success: 'Inventory settings saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save settings' };
  }
}
