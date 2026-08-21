/**
 * Production cutover env loader — Platform writes + Hair read-only preflight.
 *
 * Load order (non-empty values only, later wins where noted):
 *   1. `.env.production-cutover.local` (gitignored — paste production Platform URL)
 *   2. Shell exports (already set)
 *   3. `loadAppEnv()` for Hair production resolution only when not overridden
 *
 * Safety:
 *   - Platform host must NOT match staging Platform or production Hair hosts.
 *   - Hair read-only preflight must target production Hair host only.
 *   - SaaS flags must remain OFF unless explicitly overridden in shell.
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { resolveHairDatabaseUrl } from '@/src/hair/lib/db/env';
import { resolvePlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import {
  isFyhSaasTenantEnabled,
  isWorkforceMembershipAuthEnabled,
} from '@/src/hair/lib/tenant/flags';

export const PRODUCTION_HAIR_HOST_FRAGMENT = 'ep-billowing-bar-au20886r';
export const STAGING_HAIR_HOST_FRAGMENT = 'ep-noisy-forest-autehrcv';
export const STAGING_PLATFORM_HOST_FRAGMENT = 'ep-green-feather-aun0w5jc';
export const PLATFORM_PRODUCTION_PROJECT_NAME = 'awesomepg-platform-production';

const PRODUCTION_CUTOVER_ENV_FILE = '.env.production-cutover.local';

let loaded = false;

function applyEnvFile(path: string): void {
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    process.env[key] = trimmed;
  }
}

export function hostFromDatabaseUrl(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.replace(/^postgres:/, 'postgresql:')).hostname || null;
  } catch {
    return null;
  }
}

export function loadProductionCutoverEnv(): void {
  if (loaded) return;
  loaded = true;

  process.env.PRODUCTION_CUTOVER = '1';

  const cutoverPath = join(process.cwd(), PRODUCTION_CUTOVER_ENV_FILE);
  if (existsSync(cutoverPath)) applyEnvFile(cutoverPath);

  if (!process.env.FYH_SAAS_TENANT?.trim()) process.env.FYH_SAAS_TENANT = '0';
  if (!process.env.WORKFORCE_MEMBERSHIP_AUTH?.trim()) process.env.WORKFORCE_MEMBERSHIP_AUTH = '0';

  loadAppEnv();
}

export function getResolvedPlatformHost(): string | null {
  return hostFromDatabaseUrl(resolvePlatformDatabaseUrl());
}

export function getResolvedProductionHairHost(): string | null {
  return hostFromDatabaseUrl(resolveHairDatabaseUrl());
}

export function assertProductionPlatformConfigured(): void {
  const url = resolvePlatformDatabaseUrl()?.trim();
  if (!url) {
    throw new Error(
      'PLATFORM_DATABASE_URL is not set for production cutover.\n' +
        `Add the pooled URL for Neon project "${PLATFORM_PRODUCTION_PROJECT_NAME}" to ${PRODUCTION_CUTOVER_ENV_FILE}.`,
    );
  }

  const platformHost = hostFromDatabaseUrl(url);
  if (!platformHost) throw new Error('PLATFORM_DATABASE_URL is not a valid URL');

  if (platformHost.includes(STAGING_PLATFORM_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Platform host ${platformHost} is staging (${STAGING_PLATFORM_HOST_FRAGMENT}).`,
    );
  }

  if (platformHost.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Platform host ${platformHost} matches production Hair (${PRODUCTION_HAIR_HOST_FRAGMENT}).`,
    );
  }

  const hair = resolveHairDatabaseUrl()?.trim();
  if (hair && hair === url) {
    throw new Error('PLATFORM_DATABASE_URL must differ from HAIR_DATABASE_URL');
  }

  const pg = process.env.DATABASE_URL?.trim();
  if (pg && pg === url) {
    throw new Error('PLATFORM_DATABASE_URL must not equal DATABASE_URL');
  }

  const invest =
    process.env.INVEST_DATABASE_URL?.trim() ||
    process.env.INVEST_DATABASE_DATABASE_URL?.trim();
  if (invest && invest === url) {
    throw new Error('PLATFORM_DATABASE_URL must not equal INVEST_DATABASE_URL');
  }

  const owner = process.env.OWNER_DATABASE_URL?.trim();
  if (owner && owner === url) {
    throw new Error('PLATFORM_DATABASE_URL must not equal OWNER_DATABASE_URL');
  }
}

export function assertProductionHairReadOnlyTarget(): void {
  const host = getResolvedProductionHairHost();
  if (!host) {
    throw new Error(
      'HAIR_DATABASE_URL is not set for production Hair read-only preflight.\n' +
        'Use loadAppEnv() / Vercel Neon integration or export HAIR_DATABASE_URL for production Hair.',
    );
  }

  if (host.includes(STAGING_HAIR_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Hair host ${host} is staging (${STAGING_HAIR_HOST_FRAGMENT}).`,
    );
  }

  if (!host.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Hair host ${host} is not production Hair (${PRODUCTION_HAIR_HOST_FRAGMENT}).`,
    );
  }
}

export function assertProductionCutoverFlagsOff(): void {
  if (isFyhSaasTenantEnabled()) {
    throw new Error('Refusing: FYH_SAAS_TENANT must remain OFF for this phase');
  }
  if (isWorkforceMembershipAuthEnabled()) {
    throw new Error('Refusing: WORKFORCE_MEMBERSHIP_AUTH must remain OFF for this phase');
  }
}

export function requireProductionPlatformEnv(): void {
  loadProductionCutoverEnv();
  assertProductionCutoverFlagsOff();
  assertProductionPlatformConfigured();
}

export function requireProductionHairReadOnlyEnv(): void {
  loadProductionCutoverEnv();
  assertProductionCutoverFlagsOff();
  assertProductionHairReadOnlyTarget();
}

export function requireProductionCutoverEnv(): void {
  loadProductionCutoverEnv();
  assertProductionCutoverFlagsOff();
  assertProductionPlatformConfigured();
  assertProductionHairReadOnlyTarget();
}

/** Production Hair + Platform writes — requires explicit operator confirmation. */
export function requireProductionCutoverWriteEnv(): void {
  if (process.env.CONFIRM_PRODUCTION_CUTOVER !== '1') {
    throw new Error(
      'Refusing production writes: set CONFIRM_PRODUCTION_CUTOVER=1 explicitly.',
    );
  }
  requireProductionCutoverEnv();
}

export function isProductionCutoverWrite(): boolean {
  return process.env.CONFIRM_PRODUCTION_CUTOVER === '1';
}

export function bootstrapArtifactPath(): string {
  return isProductionCutoverWrite()
    ? join(process.cwd(), 'production-bootstrap-ids.json')
    : join(process.cwd(), 'staging-bootstrap-ids.json');
}
