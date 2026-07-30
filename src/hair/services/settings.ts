import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhSettings,
  type FyhBillingSettings,
  type FyhBusinessHoursDay,
  type FyhCommunicationSettings,
  type FyhInventorySettings,
  type FyhPrinterSettings,
  type FyhWhatsappSettings,
} from '@/src/hair/db/schema/settings';

const DEFAULT_HOURS: FyhBusinessHoursDay[] = [
  { dayOfWeek: 0, open: '10:00', close: '20:00', closed: true },
  { dayOfWeek: 1, open: '10:00', close: '20:00' },
  { dayOfWeek: 2, open: '10:00', close: '20:00' },
  { dayOfWeek: 3, open: '10:00', close: '20:00' },
  { dayOfWeek: 4, open: '10:00', close: '20:00' },
  { dayOfWeek: 5, open: '10:00', close: '20:00' },
  { dayOfWeek: 6, open: '10:00', close: '20:00' },
];

export const DEFAULT_BILLING_SETTINGS: FyhBillingSettings = {
  defaultMarkDue: false,
  defaultMarkFullDue: false,
  defaultCreditOverpayAsAdvance: false,
};

export const DEFAULT_PRINTER_SETTINGS: FyhPrinterSettings = {
  receiptWidthMm: 80,
  autoPrint: false,
};

export const DEFAULT_WHATSAPP_SETTINGS: FyhWhatsappSettings = {
  enabled: false,
  businessPhone: null,
};

export const DEFAULT_INVENTORY_SETTINGS: FyhInventorySettings = {
  allowNegativeStock: false,
};

export type SalonSettings = Awaited<ReturnType<typeof getSalonSettings>>;

export type SalonCoreInput = {
  businessName: string;
  businessAddress?: string | null;
  defaultBufferMinutes: number;
  timezone?: string;
  businessHours: FyhBusinessHoursDay[];
  googleReviewUrl?: string | null;
};

export type GstInvoiceSettingsInput = {
  gstin?: string | null;
  invoicePrefix: string;
  defaultGstBps: number;
  invoiceNotes?: string | null;
};

export type CommunicationSettingsInput = {
  communicationSettings: FyhCommunicationSettings;
};

export type BillingSettingsInput = {
  billingSettings: FyhBillingSettings;
};

export type PrinterSettingsInput = {
  printerSettings: FyhPrinterSettings;
};

export type WhatsappSettingsInput = {
  whatsappSettings: FyhWhatsappSettings;
};

export type InventorySettingsInput = {
  inventorySettings: FyhInventorySettings;
};

/** @deprecated use section-specific inputs */
export type SalonSettingsInput = SalonCoreInput &
  GstInvoiceSettingsInput & {
    communicationSettings?: FyhCommunicationSettings | null;
  };

function mergeSettings<T extends Record<string, unknown>>(defaults: T, stored: T | null | undefined): T {
  return { ...defaults, ...(stored ?? {}) };
}

export async function getSalonSettings() {
  const [row] = await hairDb.select().from(fyhSettings).limit(1);
  if (!row) {
    const [created] = await hairDb
      .insert(fyhSettings)
      .values({
        businessHours: DEFAULT_HOURS,
        billingSettings: DEFAULT_BILLING_SETTINGS,
        printerSettings: DEFAULT_PRINTER_SETTINGS,
        whatsappSettings: DEFAULT_WHATSAPP_SETTINGS,
        inventorySettings: DEFAULT_INVENTORY_SETTINGS,
      })
      .returning();
    return normalizeSettingsRow(created!);
  }
  return normalizeSettingsRow(row);
}

function normalizeSettingsRow(row: typeof fyhSettings.$inferSelect) {
  return {
    ...row,
    businessHours: row.businessHours?.length ? row.businessHours : DEFAULT_HOURS,
    googleReviewUrl: row.googleReviewUrl ?? null,
    invoiceNotes: row.invoiceNotes ?? null,
    communicationSettings: row.communicationSettings ?? null,
    billingSettings: mergeSettings(DEFAULT_BILLING_SETTINGS, row.billingSettings),
    printerSettings: mergeSettings(DEFAULT_PRINTER_SETTINGS, row.printerSettings),
    whatsappSettings: mergeSettings(DEFAULT_WHATSAPP_SETTINGS, row.whatsappSettings),
    inventorySettings: mergeSettings(DEFAULT_INVENTORY_SETTINGS, row.inventorySettings),
    securitySettings: row.securitySettings ?? null,
  };
}

async function patchSettings(
  patch: Partial<typeof fyhSettings.$inferInsert>,
): Promise<SalonSettings> {
  const existing = await getSalonSettings();
  const [row] = await hairDb
    .update(fyhSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(fyhSettings.id, existing.id))
    .returning();
  if (!row) throw new Error('Settings not found');
  return normalizeSettingsRow(row);
}

export async function updateSalonCoreSettings(input: SalonCoreInput) {
  const existing = await getSalonSettings();
  const name = input.businessName.trim();
  if (!name) throw new Error('Business name is required');
  return patchSettings({
    businessName: name,
    businessAddress: input.businessAddress?.trim() || null,
    defaultBufferMinutes: Math.max(0, Math.round(input.defaultBufferMinutes)),
    timezone: (input.timezone?.trim() || existing.timezone || 'Asia/Kolkata').slice(0, 64),
    businessHours: input.businessHours,
    googleReviewUrl: input.googleReviewUrl?.trim() || null,
  });
}

export async function updateGstInvoiceSettings(input: GstInvoiceSettingsInput) {
  const prefix = input.invoicePrefix.trim().toUpperCase() || 'FYH';
  return patchSettings({
    gstin: input.gstin?.trim() || null,
    invoicePrefix: prefix,
    defaultGstBps: Math.max(0, Math.round(input.defaultGstBps)),
    invoiceNotes: input.invoiceNotes?.trim() || null,
  });
}

export async function updateCommunicationSettings(input: CommunicationSettingsInput) {
  return patchSettings({
    communicationSettings: {
      whatsappInvoiceTemplate: input.communicationSettings.whatsappInvoiceTemplate?.trim() || undefined,
      reviewRequestTemplate: input.communicationSettings.reviewRequestTemplate?.trim() || undefined,
    },
  });
}

export async function updateBillingSettings(input: BillingSettingsInput) {
  return patchSettings({ billingSettings: input.billingSettings });
}

export async function updateDailyClosingOpeningFloatPaise(openingFloatPaise: number) {
  const existing = await getSalonSettings();
  const paise = Math.max(0, Math.round(openingFloatPaise));
  return updateBillingSettings({
    billingSettings: {
      ...existing.billingSettings,
      dailyClosingOpeningFloatPaise: paise,
    },
  });
}

export function getDailyClosingOpeningFloatPaise(settings: SalonSettings): number {
  return Math.max(0, Math.round(settings.billingSettings.dailyClosingOpeningFloatPaise ?? 0));
}

export async function updatePrinterSettings(input: PrinterSettingsInput) {
  const width = input.printerSettings.receiptWidthMm;
  if (width !== 58 && width !== 80) {
    throw new Error('Receipt width must be 58mm or 80mm');
  }
  return patchSettings({ printerSettings: input.printerSettings });
}

export async function updateWhatsappSettings(input: WhatsappSettingsInput) {
  const phone = input.whatsappSettings.businessPhone?.trim() || null;
  return patchSettings({
    whatsappSettings: {
      enabled: Boolean(input.whatsappSettings.enabled),
      businessPhone: phone,
    },
  });
}

export async function updateInventorySettings(input: InventorySettingsInput) {
  return patchSettings({ inventorySettings: input.inventorySettings });
}

/** @deprecated use section-specific updaters */
export async function updateSalonSettings(input: SalonSettingsInput) {
  await updateSalonCoreSettings(input);
  await updateGstInvoiceSettings(input);
  if (input.communicationSettings) {
    await updateCommunicationSettings({ communicationSettings: input.communicationSettings });
  }
  return getSalonSettings();
}

export { DEFAULT_HOURS };
