import { eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAdminUsers, acAuthSessions, acSettings } from '@/src/capital/db/schema';
import { hashPassword, verifyPassword } from '@/src/capital/lib/auth/crypto';
import { logActivity } from './activity';

export async function getSettings() {
  const [settings] = await capitalDb.select().from(acSettings).limit(1);
  return settings ?? null;
}

export async function updateSettings(input: {
  businessName: string;
  profitShareNumerator: number;
  profitShareDenominator: number;
  currencyCode: string;
  logoUrl?: string;
}) {
  const [existing] = await capitalDb.select().from(acSettings).limit(1);
  if (!existing) throw new Error('Settings not found');

  const [updated] = await capitalDb
    .update(acSettings)
    .set({
      businessName: input.businessName,
      profitShareNumerator: input.profitShareNumerator,
      profitShareDenominator: input.profitShareDenominator,
      currencyCode: input.currencyCode,
      logoUrl: input.logoUrl ?? existing.logoUrl,
      updatedAt: new Date(),
    })
    .where(eq(acSettings.id, existing.id))
    .returning();

  await logActivity({
    action: 'settings_updated',
    entityType: 'settings',
    entityId: existing.id,
    afterState: input,
  });

  return updated;
}

export async function changeAdminPassword(adminId: string, currentPassword: string, newPassword: string) {
  const [admin] = await capitalDb.select().from(acAdminUsers).where(eq(acAdminUsers.id, adminId)).limit(1);
  if (!admin) throw new Error('Admin not found');
  if (!verifyPassword(currentPassword, admin.passwordHash)) {
    throw new Error('Current password is incorrect');
  }

  await capitalDb
    .update(acAdminUsers)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(acAdminUsers.id, adminId));

  await capitalDb
    .update(acAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(acAuthSessions.adminUserId, adminId));

  await logActivity({
    action: 'password_changed',
    entityType: 'admin',
    entityId: adminId,
  });
}
