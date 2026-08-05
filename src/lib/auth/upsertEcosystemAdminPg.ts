import { eq, inArray } from 'drizzle-orm';
import { adminUsers } from '@/src/db/schema';
import { hashPassword } from '@/src/lib/auth/crypto';
import {
  LEGACY_PG_ADMIN_EMAILS,
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';
import type { db as pgDb } from '@/src/db/client';

export type UpsertPgAdminResult =
  | { action: 'created'; email: string }
  | { action: 'updated'; email: string; previousEmail: string }
  | { action: 'skipped'; reason: string };

type PgDb = typeof pgDb;

export async function upsertPgEcosystemAdmin(db: PgDb): Promise<UpsertPgAdminResult> {
  const password = resolveEcosystemAdminPassword();
  if (!password) {
    return {
      action: 'skipped',
      reason: 'ECOSYSTEM_ADMIN_PASSWORD (or ADMIN_INITIAL_PASSWORD) not set',
    };
  }

  const email = resolveEcosystemAdminEmail();
  const passwordHash = hashPassword(password);
  const now = new Date();

  const [targetRow] = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (targetRow) {
    await db
      .update(adminUsers)
      .set({
        passwordHash,
        mustChangePassword: false,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, targetRow.id));
    return { action: 'updated', email, previousEmail: targetRow.email };
  }

  const legacyEmails = [...LEGACY_PG_ADMIN_EMAILS];
  const [legacyRow] = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(inArray(adminUsers.email, legacyEmails))
    .limit(1);

  if (legacyRow) {
    await db
      .update(adminUsers)
      .set({
        email,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, legacyRow.id));
    return { action: 'updated', email, previousEmail: legacyRow.email };
  }

  await db.insert(adminUsers).values({
    fullName: 'Super Admin',
    email,
    passwordHash,
    role: 'super_admin',
    pgScope: [],
    isActive: true,
    mustChangePassword: false,
  });

  return { action: 'created', email };
}
