#!/usr/bin/env tsx
/**
 * Verify ecosystem admin password hash accepts ECOSYSTEM_ADMIN_PASSWORD on each DB.
 *
 *   ECOSYSTEM_ADMIN_PASSWORD='…' npx tsx scripts/verify-ecosystem-admin-login.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '@/src/db/client';
import { createHairClient } from '@/src/hair/db/client';
import { createCapitalClient } from '@/src/capital/db/client';
import { createOwnerClient } from '@/src/owner/db/client';
import { adminUsers } from '@/src/db/schema';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import { acAdminUsers } from '@/src/capital/db/schema';
import { ooAdminUsers } from '@/src/owner/db/schema';
import { verifyPassword } from '@/src/lib/auth/crypto';
import {
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

type Check = { system: string; ok: boolean; detail: string };

async function checkPg(email: string, password: string): Promise<Check> {
  if (!hasDatabaseUrl()) {
    return { system: 'Awesome PG Admin', ok: false, detail: 'DATABASE_URL not configured' };
  }
  const { db } = createClient({ max: 1 });
  const [row] = await db
    .select({ email: adminUsers.email, passwordHash: adminUsers.passwordHash, isActive: adminUsers.isActive })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (!row) return { system: 'Awesome PG Admin', ok: false, detail: `${email} not found` };
  if (!row.isActive) return { system: 'Awesome PG Admin', ok: false, detail: 'account inactive' };
  const ok = verifyPassword(password, row.passwordHash);
  return {
    system: 'Awesome PG Admin',
    ok,
    detail: ok ? `login OK for ${row.email}` : 'password hash mismatch',
  };
}

async function checkHair(email: string, password: string): Promise<Check> {
  if (!process.env.HAIR_DATABASE_URL?.trim() && !process.env.HAIR_DATABASE_DATABASE_URL?.trim()) {
    return { system: 'FYH Salon Admin', ok: false, detail: 'HAIR_DATABASE_URL not configured' };
  }
  const { db, close } = createHairClient({ max: 1 });
  try {
    const [row] = await db
      .select({ email: fyhAdminUsers.email, passwordHash: fyhAdminUsers.passwordHash })
      .from(fyhAdminUsers)
      .where(eq(fyhAdminUsers.email, email))
      .limit(1);
    if (!row) return { system: 'FYH Salon Admin', ok: false, detail: `${email} not found` };
    const ok = verifyPassword(password, row.passwordHash);
    return {
      system: 'FYH Salon Admin',
      ok,
      detail: ok ? `login OK for ${row.email}` : 'password hash mismatch',
    };
  } finally {
    await close();
  }
}

async function checkCapital(email: string, password: string): Promise<Check> {
  if (!process.env.INVEST_DATABASE_URL?.trim() && !process.env.INVEST_DATABASE_DATABASE_URL?.trim()) {
    return {
      system: 'Automotive Capital Admin',
      ok: false,
      detail: 'INVEST_DATABASE_URL not configured',
    };
  }
  const { db, close } = createCapitalClient({ max: 1 });
  try {
    const [row] = await db
      .select({ email: acAdminUsers.email, passwordHash: acAdminUsers.passwordHash })
      .from(acAdminUsers)
      .where(eq(acAdminUsers.email, email))
      .limit(1);
    if (!row) return { system: 'Automotive Capital Admin', ok: false, detail: `${email} not found` };
    const ok = verifyPassword(password, row.passwordHash);
    return {
      system: 'Automotive Capital Admin',
      ok,
      detail: ok ? `login OK for ${row.email}` : 'password hash mismatch',
    };
  } finally {
    await close();
  }
}

async function checkOwner(email: string, password: string): Promise<Check> {
  if (!hasOwnerDatabaseUrl()) {
    return { system: 'Owner OS Admin', ok: false, detail: 'OWNER_DATABASE_URL not configured' };
  }
  const { db, close } = createOwnerClient({ max: 1 });
  try {
    const [row] = await db
      .select({ email: ooAdminUsers.email, passwordHash: ooAdminUsers.passwordHash })
      .from(ooAdminUsers)
      .where(eq(ooAdminUsers.email, email))
      .limit(1);
    if (!row) return { system: 'Owner OS Admin', ok: false, detail: `${email} not found` };
    const ok = verifyPassword(password, row.passwordHash);
    return {
      system: 'Owner OS Admin',
      ok,
      detail: ok ? `login OK for ${row.email}` : 'password hash mismatch',
    };
  } finally {
    await close();
  }
}

async function main() {
  const password = resolveEcosystemAdminPassword();
  if (!password) {
    console.error('Set ECOSYSTEM_ADMIN_PASSWORD in the environment first.');
    process.exit(1);
  }
  const email = resolveEcosystemAdminEmail();
  console.log(`Verifying admin login credentials for ${email}\n`);

  const checks = await Promise.all([
    checkPg(email, password),
    checkHair(email, password),
    checkCapital(email, password),
    checkOwner(email, password),
  ]);

  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.system}: ${c.detail}`);
  }

  try {
    await closeDb();
  } catch {
    // PG client may not have been opened when DATABASE_URL is unset.
  }
  const required = checks.filter((c) => !c.detail.includes('not configured'));
  if (required.some((c) => !c.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
