/* eslint-disable no-console */
/**
 * Validate database environment configuration for local development.
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
import {
  formatDatabaseConfigReport,
  getDatabaseConnectionInfo,
  hasDatabaseUrl,
} from '../src/lib/db/env';
import {
  getHairDatabaseHost,
  hasHairDatabaseUrl,
  resolveHairDatabaseUrl,
} from '../src/hair/lib/db/env';
import {
  getPlatformDatabaseHost,
  hasPlatformDatabaseUrl,
  resolvePlatformDatabaseUrl,
} from '../src/platform/lib/db/env';

loadAppEnv();

type Product = 'pg' | 'hair' | 'capital' | 'platform';

function productFromArgv(): Product {
  const flag = process.argv.find((a) => a.startsWith('--product='));
  const value = flag?.split('=')[1]?.trim().toLowerCase();
  if (value === 'hair' || value === 'capital' || value === 'pg' || value === 'platform') return value;
  return 'pg';
}

function capitalUrl(): string | undefined {
  return (
    process.env.INVEST_DATABASE_URL?.trim() ||
    process.env.INVEST_DATABASE_DATABASE_URL?.trim() ||
    process.env.INVEST_POSTGRES_URL?.trim()
  );
}

function envLine(key: string, value: string | undefined): string {
  if (!(key in process.env)) return `${key} .......... Missing`;
  if (!value) return `${key} .......... Empty (not exported)`;
  return `${key} .......... Found`;
}

function printMonorepoOverview() {
  console.log('MONOREPO DATABASE KEYS (overview)');
  console.log(`  ${envLine('DATABASE_URL', process.env.DATABASE_URL?.trim())}`);
  console.log(`  ${envLine('HAIR_DATABASE_URL', resolveHairDatabaseUrl())}`);
  console.log(`  ${envLine('INVEST_DATABASE_URL', capitalUrl())}`);
  console.log(`  ${envLine('PLATFORM_DATABASE_URL', resolvePlatformDatabaseUrl())}`);
  console.log('');
  console.log('Contract: docs/ENV_CONTRACT.md');
  console.log('');
}

const product = productFromArgv();
printMonorepoOverview();

if (product === 'hair') {
  if (!hasHairDatabaseUrl()) {
    console.error(formatHairHairReport());
    process.exit(1);
  }
  const host = getHairDatabaseHost();
  console.log(`Hair DB: resolved → ${host ?? 'unknown host'}`);
  process.exit(0);
}

if (product === 'platform') {
  if (!hasPlatformDatabaseUrl()) {
    console.error('PLATFORM_DATABASE_URL is not set.\nSee docs/foryourhair/PHASE_0B_STAGING_PROVISION.md');
    process.exit(1);
  }
  const host = getPlatformDatabaseHost();
  console.log(`Platform DB: resolved → ${host ?? 'unknown host'}`);
  process.exit(0);
}

if (product === 'capital') {
  const url = capitalUrl();
  if (!url) {
    console.error(
      'INVEST_DATABASE_URL is not set.\nAdd Automotive Capital Neon URL to .env.local (see docs/ENV_CONTRACT.md).',
    );
    process.exit(1);
  }
  try {
    const host = new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
    console.log(`Capital DB: resolved → ${host}`);
  } catch {
    console.log('Capital DB: resolved (URL present)');
  }
  process.exit(0);
}

console.log(formatDatabaseConfigReport());

if (!hasDatabaseUrl()) {
  process.exit(1);
}

try {
  const info = getDatabaseConnectionInfo();
  console.log('');
  console.log(`Resolved: ${info.source} → ${info.host}/${info.database} (${info.environment})`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

function formatHairHairReport(): string {
  return [
    'HAIR DATABASE CONFIGURATION',
    `  HAIR_DATABASE_URL .......... ${resolveHairDatabaseUrl() ? 'Found' : 'Missing or empty'}`,
    '',
    'Hair dev does not require DATABASE_URL when HAIR_DATABASE_URL is set.',
    'Fix: Neon → connection string → HAIR_DATABASE_URL in .env.local',
    'Then: npm run hair:db:migrate && npm run hair:db:seed',
  ].join('\n');
}
