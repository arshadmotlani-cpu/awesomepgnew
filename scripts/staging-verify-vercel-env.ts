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
  'FYH_SAAS_TENANT',
  'WORKFORCE_MEMBERSHIP_AUTH',
] as const;

const PRODUCTION_HAIR_HOST_FRAGMENT = 'ep-billowing-bar-au20886r';

function hostFromDatabaseUrl(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return null;
  }
}

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

  const hairRow = preview.find((e) => e.key === 'HAIR_DATABASE_URL');
  const hairHost = hostFromDatabaseUrl(hairRow?.value);
  if (hairHost) {
    console.log(`\nHair DB host (Preview): ${hairHost}`);
    if (hairHost.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
      console.error(`Refusing: Hair Preview URL is production (${PRODUCTION_HAIR_HOST_FRAGMENT})`);
      process.exit(1);
    }
  }
  const platRow = preview.find((e) => e.key === 'PLATFORM_DATABASE_URL');
  const platHost = hostFromDatabaseUrl(platRow?.value);
  if (platHost) console.log(`Platform DB host (Preview): ${platHost}`);
  if (hairHost && platHost && hairHost === platHost) {
    console.error('Refusing: Hair and Platform Preview URLs share the same host');
    process.exit(1);
  }

  const prod = body.envs.filter((e) => e.target?.includes('production'));
  for (const key of ['FYH_SAAS_TENANT', 'WORKFORCE_MEMBERSHIP_AUTH']) {
    const row = prod.find((e) => e.key === key);
    const v = row?.value?.trim() || '(unset)';
    if (v === '1') {
      console.warn(`⚠ Production ${key} is enabled — do not enable SaaS on Production yet`);
    } else {
      console.log(`Production ${key}: ${v}`);
    }
  }

  console.log('\n✓ All staging Preview variables populated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
