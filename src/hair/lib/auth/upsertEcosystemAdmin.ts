import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import { hashPassword } from '@/src/hair/lib/auth/crypto';
import {
  LEGACY_HAIR_ADMIN_EMAILS,
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';

export type UpsertHairAdminResult =
  | { action: 'created'; email: string }
  | { action: 'updated'; email: string; previousEmail: string }
  | { action: 'skipped'; reason: string };

export async function upsertHairEcosystemAdmin(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<UpsertHairAdminResult> {
  const password = resolveEcosystemAdminPassword();
  if (!password) {
    return { action: 'skipped', reason: 'ECOSYSTEM_ADMIN_PASSWORD (or HAIR_ADMIN_PASSWORD) not set' };
  }

  const email = resolveEcosystemAdminEmail();
  const passwordHash = hashPassword(password);

  const [targetRow] = await db
    .select({ id: fyhAdminUsers.id, email: fyhAdminUsers.email })
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.email, email))
    .limit(1);

  if (targetRow) {
    await db
      .update(fyhAdminUsers)
      .set({ passwordHash, displayName: 'Administrator' })
      .where(eq(fyhAdminUsers.id, targetRow.id));
    return { action: 'updated', email, previousEmail: targetRow.email };
  }

  const [legacyRow] = await db
    .select({ id: fyhAdminUsers.id, email: fyhAdminUsers.email })
    .from(fyhAdminUsers)
    .where(inArray(fyhAdminUsers.email, [...LEGACY_HAIR_ADMIN_EMAILS]))
    .limit(1);

  if (legacyRow) {
    await db
      .update(fyhAdminUsers)
      .set({ email, passwordHash, displayName: 'Administrator', role: 'super_admin' })
      .where(eq(fyhAdminUsers.id, legacyRow.id));
    return { action: 'updated', email, previousEmail: legacyRow.email };
  }

  const [onlyAdmin] = await db
    .select({ id: fyhAdminUsers.id, email: fyhAdminUsers.email })
    .from(fyhAdminUsers)
    .limit(1);

  if (onlyAdmin) {
    await db
      .update(fyhAdminUsers)
      .set({ email, passwordHash, displayName: 'Administrator', role: 'super_admin' })
      .where(eq(fyhAdminUsers.id, onlyAdmin.id));
    return { action: 'updated', email, previousEmail: onlyAdmin.email };
  }

  await db.insert(fyhAdminUsers).values({
    email,
    passwordHash,
    displayName: 'Administrator',
    role: 'super_admin',
  });

  return { action: 'created', email };
}
