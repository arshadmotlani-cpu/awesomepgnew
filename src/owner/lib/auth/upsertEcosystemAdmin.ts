import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ooAdminUsers } from '@/src/owner/db/schema';
import { hashPassword } from '@/src/owner/lib/auth/crypto';
import {
  LEGACY_OWNER_ADMIN_EMAILS,
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';

export type UpsertOwnerAdminResult =
  | { action: 'created'; email: string }
  | { action: 'updated'; email: string; previousEmail: string }
  | { action: 'skipped'; reason: string };

export async function upsertOwnerEcosystemAdmin(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<UpsertOwnerAdminResult> {
  const password = resolveEcosystemAdminPassword();
  if (!password || password.length < 8) {
    return {
      action: 'skipped',
      reason: 'ECOSYSTEM_ADMIN_PASSWORD (or OWNER_ADMIN_PASSWORD) not set (≥8 chars)',
    };
  }

  const email = resolveEcosystemAdminEmail();
  const passwordHash = hashPassword(password);

  const [targetRow] = await db
    .select({ id: ooAdminUsers.id, email: ooAdminUsers.email })
    .from(ooAdminUsers)
    .where(eq(ooAdminUsers.email, email))
    .limit(1);

  if (targetRow) {
    await db
      .update(ooAdminUsers)
      .set({ passwordHash, displayName: 'Owner' })
      .where(eq(ooAdminUsers.id, targetRow.id));
    return { action: 'updated', email, previousEmail: targetRow.email };
  }

  const [legacyRow] = await db
    .select({ id: ooAdminUsers.id, email: ooAdminUsers.email })
    .from(ooAdminUsers)
    .where(inArray(ooAdminUsers.email, [...LEGACY_OWNER_ADMIN_EMAILS]))
    .limit(1);

  if (legacyRow) {
    await db
      .update(ooAdminUsers)
      .set({ email, passwordHash, displayName: 'Owner' })
      .where(eq(ooAdminUsers.id, legacyRow.id));
    return { action: 'updated', email, previousEmail: legacyRow.email };
  }

  const [onlyAdmin] = await db
    .select({ id: ooAdminUsers.id, email: ooAdminUsers.email })
    .from(ooAdminUsers)
    .limit(1);

  if (onlyAdmin) {
    await db
      .update(ooAdminUsers)
      .set({ email, passwordHash, displayName: 'Owner' })
      .where(eq(ooAdminUsers.id, onlyAdmin.id));
    return { action: 'updated', email, previousEmail: onlyAdmin.email };
  }

  await db.insert(ooAdminUsers).values({
    email,
    passwordHash,
    displayName: 'Owner',
  });

  return { action: 'created', email };
}
