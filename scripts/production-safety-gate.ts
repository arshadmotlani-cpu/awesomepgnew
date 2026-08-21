/* eslint-disable no-console */
/**
 * Production cutover safety gate — Platform URL isolation + flags OFF.
 * Does not connect to Hair unless HAIR_DATABASE_URL is also exported (optional line).
 */
import {
  PLATFORM_PRODUCTION_PROJECT_NAME,
  PRODUCTION_HAIR_HOST_FRAGMENT,
  STAGING_HAIR_HOST_FRAGMENT,
  STAGING_PLATFORM_HOST_FRAGMENT,
  assertProductionCutoverFlagsOff,
  assertProductionPlatformConfigured,
  getResolvedPlatformHost,
  getResolvedProductionHairHost,
  loadProductionCutoverEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { assertPlatformDatabaseIsolated } from '@/src/platform/lib/db/env';

loadProductionCutoverEnv();

try {
  assertProductionCutoverFlagsOff();
  assertProductionPlatformConfigured();
  assertPlatformDatabaseIsolated();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const platformHost = getResolvedPlatformHost();
const hairHost = getResolvedProductionHairHost();

console.log('✓ Production cutover safety gate passed');
console.log(`  Platform project (expected): ${PLATFORM_PRODUCTION_PROJECT_NAME}`);
console.log(`  Platform host: ${platformHost}`);
console.log(`  Blocked staging Platform: ${STAGING_PLATFORM_HOST_FRAGMENT}`);
console.log(`  Blocked production Hair as Platform: ${PRODUCTION_HAIR_HOST_FRAGMENT}`);
if (hairHost) {
  console.log(`  Hair host (if set): ${hairHost}`);
  if (hairHost.includes(STAGING_HAIR_HOST_FRAGMENT)) {
    console.error('Refusing: Hair host is staging');
    process.exit(1);
  }
}
console.log('  FYH_SAAS_TENANT: OFF');
console.log('  WORKFORCE_MEMBERSHIP_AUTH: OFF');
