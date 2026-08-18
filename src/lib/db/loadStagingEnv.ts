/**
 * Load Phase 0B staging credentials for local CLI work.
 *
 * Load order (later wins for non-empty values only):
 *   1. `.env.staging.local` (gitignored — paste Neon pooled URLs here)
 *   2. `.env.staging.preview` (optional `vercel env pull` snapshot)
 *
 * When STAGING_ONLY=1 (set automatically), production Hair integration keys
 * are cleared so HAIR_DATABASE_DATABASE_URL cannot override staging.
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppEnv } from '@/src/lib/db/loadEnv';

const PRODUCTION_HAIR_HOST_FRAGMENT = 'ep-billowing-bar-au20886r';

const PRODUCTION_HAIR_INTEGRATION_KEYS = [
  'HAIR_DATABASE_DATABASE_URL',
  'HAIR_DATABASE_DATABASE_URL_UNPOOLED',
  'HAIR_DATABASE_POSTGRES_URL',
  'HAIR_DATABASE_POSTGRES_PRISMA_URL',
  'HAIR_DATABASE_POSTGRES_URL_NON_POOLING',
  'HAIR_DATABASE_POSTGRES_URL_NO_SSL',
  'HAIR_DATABASE_PGHOST',
  'HAIR_DATABASE_PGHOST_UNPOOLED',
] as const;

const STAGING_HAIR_ALIASES = [
  'HAIR_DATABASE_URL',
  'FYH_STAGING_DATABASE_URL',
  'FYH_STAGING_POSTGRES_URL',
  'FYH_STAGING_POSTGRES_PRISMA_URL',
] as const;

const STAGING_PLATFORM_ALIASES = [
  'PLATFORM_DATABASE_URL',
  'PLATFORM_STAGING_DATABASE_URL',
  'PLATFORM_STAGING_POSTGRES_URL',
  'PLATFORM_STAGING_POSTGRES_PRISMA_URL',
] as const;

let loaded = false;

function applyEnvFile(path: string): void {
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!process.env[key]?.trim()) process.env[key] = trimmed;
  }
}

function resolveFirst(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function clearProductionHairIntegrationFallbacks(): void {
  for (const key of PRODUCTION_HAIR_INTEGRATION_KEYS) {
    delete process.env[key];
  }
}

function normalizeCanonicalStagingUrls(): void {
  const hair = resolveFirst(STAGING_HAIR_ALIASES);
  const platform = resolveFirst(STAGING_PLATFORM_ALIASES);
  if (hair) process.env.HAIR_DATABASE_URL = hair;
  if (platform) process.env.PLATFORM_DATABASE_URL = platform;
}

export function getResolvedHairHost(): string | null {
  const url = process.env.HAIR_DATABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname || null;
  } catch {
    return null;
  }
}

export function assertStagingHairNotProduction(): void {
  const host = getResolvedHairHost();
  if (!host) {
    throw new Error(
      'HAIR_DATABASE_URL is not set for staging.\n' +
        'Add pooled Neon URLs to .env.staging.local (see .env.staging.local.example)\n' +
        'or populate HAIR_DATABASE_URL on Vercel Preview (currently empty).',
    );
  }
  if (host.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing to run: Hair host ${host} is production (${PRODUCTION_HAIR_HOST_FRAGMENT}).\n` +
        'Set HAIR_DATABASE_URL to the fyh-phase-0b-staging branch pooled URL only.',
    );
  }
}

export function assertStagingPlatformConfigured(): void {
  const url = process.env.PLATFORM_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'PLATFORM_DATABASE_URL is not set for staging.\n' +
        'Add awesomepg-platform-staging pooled URL to .env.staging.local or Vercel Preview.',
    );
  }
  const hair = process.env.HAIR_DATABASE_URL?.trim();
  if (hair && hair === url) {
    throw new Error('PLATFORM_DATABASE_URL must differ from HAIR_DATABASE_URL');
  }
}

/** Load staging env files, normalize URLs, and block production Hair integration fallbacks. */
export function loadStagingEnv(): void {
  if (loaded) return;
  loaded = true;

  process.env.STAGING_ONLY = '1';
  if (!process.env.FYH_SAAS_TENANT?.trim()) process.env.FYH_SAAS_TENANT = '0';
  if (!process.env.WORKFORCE_MEMBERSHIP_AUTH?.trim()) process.env.WORKFORCE_MEMBERSHIP_AUTH = '0';

  const cwd = process.cwd();
  const localPath = join(cwd, '.env.staging.local');
  if (existsSync(localPath)) applyEnvFile(localPath);

  const previewPath = join(cwd, '.env.staging.preview');
  if (existsSync(previewPath)) applyEnvFile(previewPath);

  normalizeCanonicalStagingUrls();
  clearProductionHairIntegrationFallbacks();

  // Shell exports win; do not load .env.local production integration.
  loadAppEnv();
  normalizeCanonicalStagingUrls();
  clearProductionHairIntegrationFallbacks();
}

export function requireStagingEnv(): void {
  loadStagingEnv();
  assertStagingHairNotProduction();
  assertStagingPlatformConfigured();
}

export { PRODUCTION_HAIR_HOST_FRAGMENT };
