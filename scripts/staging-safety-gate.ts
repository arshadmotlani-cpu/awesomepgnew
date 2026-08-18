/* eslint-disable no-console */
/**
 * Phase 0B staging safety gate — abort before any Hair/Platform DB access
 * if URLs are missing or resolve to production Hair.
 */
import {
  assertStagingHairNotProduction,
  assertStagingPlatformConfigured,
  getResolvedHairHost,
  loadStagingEnv,
  PRODUCTION_HAIR_HOST_FRAGMENT,
} from '@/src/lib/db/loadStagingEnv';
import { getPlatformDatabaseHost } from '@/src/platform/lib/db/env';
import {
  isFyhSaasTenantEnabled,
  isWorkforceMembershipAuthEnabled,
} from '@/src/hair/lib/tenant/flags';

loadStagingEnv();

try {
  assertStagingHairNotProduction();
  assertStagingPlatformConfigured();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const hairHost = getResolvedHairHost();
const platformHost = getPlatformDatabaseHost();
console.log('✓ Staging safety gate passed');
console.log(`  Hair host: ${hairHost}`);
console.log(`  Platform host: ${platformHost}`);
console.log(`  Production blocked: ${PRODUCTION_HAIR_HOST_FRAGMENT}`);
console.log(`  FYH_SAAS_TENANT: ${isFyhSaasTenantEnabled() ? 'ON' : 'OFF'}`);
console.log(`  WORKFORCE_MEMBERSHIP_AUTH: ${isWorkforceMembershipAuthEnabled() ? 'ON' : 'OFF'}`);
