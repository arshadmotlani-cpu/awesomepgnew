/**
 * Smoke test for admin resident search tiers.
 * Usage: npx tsx scripts/verify-admin-resident-search.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import {
  getResidentSearchSchemaCapabilities,
  searchResidentsForAdmin,
  enrichResidentSearchResults,
} from '../src/services/adminResidentSearch';

const session = {
  kind: 'admin' as const,
  sessionId: 'verify',
  adminId: 'verify',
  email: 'verify@test.com',
  fullName: 'Verify',
  role: 'super_admin' as const,
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86400000),
};

async function main() {
  const caps = await getResidentSearchSchemaCapabilities();
  console.log('schema capabilities:', caps);

  for (const q of ['aa', 'test', 'har']) {
    const rows = await searchResidentsForAdmin(session, q, 10);
    const enriched = await enrichResidentSearchResults(rows);
    console.log(`query "${q}" -> ${enriched.length} results`);
  }

  console.log('OK — search pipeline completed without throwing');
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  if (err instanceof Error && 'cause' in err && err.cause instanceof Error) {
    console.error('cause:', err.cause.message);
  }
  process.exit(1);
});
