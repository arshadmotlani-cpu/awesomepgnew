/* eslint-disable no-console */
/**
 * Read-only check: Vercel Preview staging env vars exist and have non-empty values.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ID = 'prj_IpT653A5B96DkeeMadDRCCHsTtkE';
const KEYS = [
  'HAIR_DATABASE_URL',
  'PLATFORM_DATABASE_URL',
  'FYH_STAGING_DATABASE_URL',
  'PLATFORM_STAGING_DATABASE_URL',
  'FYH_SAAS_TENANT',
  'WORKFORCE_MEMBERSHIP_AUTH',
] as const;

async function main() {
  const authPath = join(
    process.env.HOME ?? '',
    'Library/Application Support/com.vercel.cli/auth.json',
  );
  const token = JSON.parse(readFileSync(authPath, 'utf8')).token as string;
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?decrypt=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Vercel API ${res.status}`);
  const body = (await res.json()) as { envs: Array<{ key: string; value?: string; target?: string[] }> };
  const preview = body.envs.filter((e) => e.target?.includes('preview'));

  console.log('Vercel Preview staging env (decrypted lengths only):\n');
  let missing = 0;
  for (const key of KEYS) {
    const row = preview.find((e) => e.key === key);
    const len = row?.value?.trim().length ?? 0;
    const status = len > 0 ? `ok (${len} chars)` : 'EMPTY — set value in Vercel Preview';
    console.log(`  ${key}: ${status}`);
    if (len === 0) missing += 1;
  }

  if (missing > 0) {
    console.error(`\n${missing} Preview variable(s) have no value.`);
    console.error('Neon Console → copy pooled connection strings → Vercel Preview env.');
    console.error('Or paste into .env.staging.local for local CLI (see .env.staging.local.example).');
    process.exit(1);
  }
  console.log('\n✓ All staging Preview variables populated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
