import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { acAdminUsers } from '@/src/capital/db/schema';
import { hashPassword } from '@/src/capital/lib/auth/crypto';
import {
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';

export type UpsertCapitalAdminResult =
  | { action: 'created'; email: string }
  | { action: 'updated'; email: string; previousEmail: string }
  | { action: 'skipped'; reason: string };

export async function upsertCapitalEcosystemAdmin(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<UpsertCapitalAdminResult> {
  const password = resolveEcosystemAdminPassword();
  if (!password) {
    return {
      action: 'skipped',
      reason: 'ECOSYSTEM_ADMIN_PASSWORD (or INVEST_ADMIN_PASSWORD) not set',
    };
  }

  const email = resolveEcosystemAdminEmail();
  const passwordHash = hashPassword(password);

  const [targetRow] = await db
    .select({ id: acAdminUsers.id, email: acAdminUsers.email })
    .from(acAdminUsers)
    .where(eq(acAdminUsers.email, email))
    .limit(1);

  if (targetRow) {
    await db
      .update(acAdminUsers)
      .set({ passwordHash, displayName: 'Administrator' })
      .where(eq(acAdminUsers.id, targetRow.id));
    return { action: 'updated', email, previousEmail: targetRow.email };
  }

  const [seedAdmin] = await db
    .select({ id: acAdminUsers.id, email: acAdminUsers.email })
    .from(acAdminUsers)
    .orderBy(asc(acAdminUsers.createdAt))
    .limit(1);

  if (seedAdmin) {
    await db
      .update(acAdminUsers)
      .set({ email, passwordHash, displayName: 'Administrator' })
      .where(eq(acAdminUsers.id, seedAdmin.id));
    return { action: 'updated', email, previousEmail: seedAdmin.email };
  }

  await db.insert(acAdminUsers).values({
    email,
    passwordHash,
    displayName: 'Administrator',
  });

  return { action: 'created', email };
}
