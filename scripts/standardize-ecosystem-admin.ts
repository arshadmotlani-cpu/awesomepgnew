#!/usr/bin/env tsx
/**
 * Standardize ecosystem admin credentials across PG, Hair, Capital, and Owner OS.
 *
 *   ECOSYSTEM_ADMIN_PASSWORD='…' npx tsx scripts/standardize-ecosystem-admin.ts
 *
 * Optional: ECOSYSTEM_ADMIN_EMAIL (defaults to admin@foryour.co)
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { createClient, closeDb } from '@/src/db/client';
import { createHairClient } from '@/src/hair/db/client';
import { createCapitalClient } from '@/src/capital/db/client';
import { createOwnerClient } from '@/src/owner/db/client';
import { upsertPgEcosystemAdmin } from '@/src/lib/auth/upsertEcosystemAdminPg';
import { upsertHairEcosystemAdmin } from '@/src/hair/lib/auth/upsertEcosystemAdmin';
import { upsertCapitalEcosystemAdmin } from '@/src/capital/lib/auth/upsertEcosystemAdmin';
import { upsertOwnerEcosystemAdmin } from '@/src/owner/lib/auth/upsertEcosystemAdmin';
import {
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

type EngineResult = {
  engine: string;
  database: string;
  ok: boolean;
  detail: string;
};

async function runPg(): Promise<EngineResult> {
  if (!hasDatabaseUrl()) {
    return { engine: 'Awesome PG', database: 'DATABASE_URL', ok: false, detail: 'not configured' };
  }
  const { db } = createClient({ max: 1 });
  try {
    const result = await upsertPgEcosystemAdmin(db);
    if (result.action === 'skipped') {
      return { engine: 'Awesome PG', database: 'DATABASE_URL', ok: false, detail: result.reason };
    }
    return {
      engine: 'Awesome PG',
      database: 'DATABASE_URL',
      ok: true,
      detail:
        result.action === 'created'
          ? `created ${result.email}`
          : result.previousEmail !== result.email
            ? `updated ${result.previousEmail} → ${result.email}`
            : `password refreshed for ${result.email}`,
    };
  } catch (err) {
    return {
      engine: 'Awesome PG',
      database: 'DATABASE_URL',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runHair(): Promise<EngineResult> {
  if (!process.env.HAIR_DATABASE_URL?.trim() && !process.env.HAIR_DATABASE_DATABASE_URL?.trim()) {
    return { engine: 'FYH Salon', database: 'HAIR_DATABASE_URL', ok: false, detail: 'not configured' };
  }
  const { db, close } = createHairClient({ max: 1 });
  try {
    const result = await upsertHairEcosystemAdmin(db);
    if (result.action === 'skipped') {
      return { engine: 'FYH Salon', database: 'HAIR_DATABASE_URL', ok: false, detail: result.reason };
    }
    return {
      engine: 'FYH Salon',
      database: 'HAIR_DATABASE_URL',
      ok: true,
      detail:
        result.action === 'created'
          ? `created ${result.email}`
          : result.previousEmail !== result.email
            ? `updated ${result.previousEmail} → ${result.email}`
            : `password refreshed for ${result.email}`,
    };
  } catch (err) {
    return {
      engine: 'FYH Salon',
      database: 'HAIR_DATABASE_URL',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await close();
  }
}

async function runCapital(): Promise<EngineResult> {
  if (!process.env.INVEST_DATABASE_URL?.trim() && !process.env.INVEST_DATABASE_DATABASE_URL?.trim()) {
    return {
      engine: 'Automotive Capital',
      database: 'INVEST_DATABASE_URL',
      ok: false,
      detail: 'not configured',
    };
  }
  const { db, close } = createCapitalClient({ max: 1 });
  try {
    const result = await upsertCapitalEcosystemAdmin(db);
    if (result.action === 'skipped') {
      return {
        engine: 'Automotive Capital',
        database: 'INVEST_DATABASE_URL',
        ok: false,
        detail: result.reason,
      };
    }
    return {
      engine: 'Automotive Capital',
      database: 'INVEST_DATABASE_URL',
      ok: true,
      detail:
        result.action === 'created'
          ? `created ${result.email}`
          : result.previousEmail !== result.email
            ? `updated ${result.previousEmail} → ${result.email}`
            : `password refreshed for ${result.email}`,
    };
  } catch (err) {
    return {
      engine: 'Automotive Capital',
      database: 'INVEST_DATABASE_URL',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await close();
  }
}

async function runOwner(): Promise<EngineResult> {
  if (!hasOwnerDatabaseUrl()) {
    return { engine: 'Owner OS', database: 'OWNER_DATABASE_URL', ok: false, detail: 'not configured' };
  }
  const { db, close } = createOwnerClient({ max: 1 });
  try {
    const result = await upsertOwnerEcosystemAdmin(db);
    if (result.action === 'skipped') {
      return { engine: 'Owner OS', database: 'OWNER_DATABASE_URL', ok: false, detail: result.reason };
    }
    return {
      engine: 'Owner OS',
      database: 'OWNER_DATABASE_URL',
      ok: true,
      detail:
        result.action === 'created'
          ? `created ${result.email}`
          : result.previousEmail !== result.email
            ? `updated ${result.previousEmail} → ${result.email}`
            : `password refreshed for ${result.email}`,
    };
  } catch (err) {
    return {
      engine: 'Owner OS',
      database: 'OWNER_DATABASE_URL',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
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
  console.log(`Standardizing ecosystem admin → ${email}\n`);

  const results = await Promise.all([runPg(), runHair(), runCapital(), runOwner()]);
  try {
    await closeDb();
  } catch {
    // PG client may not have been opened when DATABASE_URL is unset.
  }

  for (const r of results) {
    console.log(`${r.ok ? '✓' : '⚠'} ${r.engine} (${r.database}): ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok && r.detail !== 'not configured');
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
