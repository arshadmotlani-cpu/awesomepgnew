import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhSettings,
  type FyhBusinessHoursDay,
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

export type SalonSettingsInput = {
  businessName: string;
  businessAddress?: string | null;
  gstin?: string | null;
  invoicePrefix: string;
  defaultGstBps: number;
  defaultBufferMinutes: number;
  timezone?: string;
  businessHours: FyhBusinessHoursDay[];
};

export async function getSalonSettings() {
  const [row] = await hairDb.select().from(fyhSettings).limit(1);
  if (!row) {
    const [created] = await hairDb
      .insert(fyhSettings)
      .values({ businessHours: DEFAULT_HOURS })
      .returning();
    return created!;
  }
  return {
    ...row,
    businessHours: row.businessHours?.length ? row.businessHours : DEFAULT_HOURS,
  };
}

export async function updateSalonSettings(input: SalonSettingsInput) {
  const existing = await getSalonSettings();
  const name = input.businessName.trim();
  if (!name) throw new Error('Business name is required');
  const prefix = input.invoicePrefix.trim().toUpperCase() || 'FYH';
  const [row] = await hairDb
    .update(fyhSettings)
    .set({
      businessName: name,
      businessAddress: input.businessAddress?.trim() || null,
      gstin: input.gstin?.trim() || null,
      invoicePrefix: prefix,
      defaultGstBps: Math.max(0, Math.round(input.defaultGstBps)),
      defaultBufferMinutes: Math.max(0, Math.round(input.defaultBufferMinutes)),
      timezone: (input.timezone?.trim() || existing.timezone || 'Asia/Kolkata').slice(0, 64),
      businessHours: input.businessHours,
      updatedAt: new Date(),
    })
    .where(eq(fyhSettings.id, existing.id))
    .returning();
  if (!row) throw new Error('Settings not found');
  return row;
}

export { DEFAULT_HOURS };
