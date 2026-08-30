import { resolveHairDatabaseUrl } from '@/src/hair/lib/db/env';
import {
  PRODUCTION_HAIR_HOST_FRAGMENT,
  STAGING_HAIR_HOST_FRAGMENT,
  hostFromDatabaseUrl,
} from '@/src/lib/db/loadProductionCutoverEnv';

export type HairWriteContext = 'integration-test' | 'script' | 'application';

function resolvedHairUrl(): string {
  return resolveHairDatabaseUrl() ?? '';
}

/** True when Node test runner or Hair integration suite is executing. */
export function isHairIntegrationTestRunner(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.HAIR_INTEGRATION_TEST === '1') return true;
  return process.argv.some((arg) => arg === '--test' || arg.endsWith('.test.ts'));
}

export function isProductionHairDatabaseUrl(url = resolvedHairUrl()): boolean {
  const host = hostFromDatabaseUrl(url);
  return Boolean(host && host.includes(PRODUCTION_HAIR_HOST_FRAGMENT));
}

export function isStagingHairDatabaseUrl(url = resolvedHairUrl()): boolean {
  const host = hostFromDatabaseUrl(url);
  return Boolean(host && host.includes(STAGING_HAIR_HOST_FRAGMENT));
}

/** Explicit dedicated integration-test database (never production). */
export function isDedicatedHairTestDatabaseUrl(url = resolvedHairUrl()): boolean {
  if (!url.trim()) return false;
  if (isProductionHairDatabaseUrl(url)) return false;
  const explicit = process.env.HAIR_TEST_DATABASE_URL?.trim();
  if (explicit && explicit === url.trim()) return true;
  return isStagingHairDatabaseUrl(url);
}

/**
 * Fail closed before Hair integration tests mutate data.
 * Production Hair is never writable from the test runner, regardless of override env vars.
 */
export function assertHairIntegrationTestWritesAllowed(): void {
  if (!isHairIntegrationTestRunner()) return;

  const url = resolvedHairUrl();
  if (!url) {
    throw new Error(
      'Hair integration tests require HAIR_DATABASE_URL pointing at a dedicated test/staging database.',
    );
  }

  if (isProductionHairDatabaseUrl(url)) {
    throw new Error(
      'Refusing Hair integration test writes against production Hair database ' +
        `(host contains ${PRODUCTION_HAIR_HOST_FRAGMENT}). ` +
        'Point HAIR_DATABASE_URL at fyh-phase-0b-staging or set HAIR_TEST_DATABASE_URL to an explicit non-production database. ' +
        'HAIR_ALLOW_INTEGRATION_WRITES cannot override production protection.',
    );
  }

  if (!isDedicatedHairTestDatabaseUrl(url)) {
    throw new Error(
      'Hair integration tests require a dedicated test database. ' +
        'Use the staging Hair Neon branch (fyh-phase-0b-staging) or set HAIR_TEST_DATABASE_URL to the exact non-production connection string.',
    );
  }
}

/** Guard Hair DB connections at the client boundary. */
export function assertHairDatabaseClientAllowed(context: HairWriteContext = 'application'): void {
  if (context === 'integration-test' || isHairIntegrationTestRunner()) {
    assertHairIntegrationTestWritesAllowed();
  }
}
