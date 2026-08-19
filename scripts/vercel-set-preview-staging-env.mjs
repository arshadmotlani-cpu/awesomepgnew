#!/usr/bin/env node
/**
 * Set Preview-only staging SaaS env on Vercel (never Production).
 * Reads URLs from .env.staging.local (gitignored).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

const PROJECT_ID = 'prj_IpT653A5B96DkeeMadDRCCHsTtkE';
const PROD_FRAG = 'ep-billowing-bar-au20886r';

function hostFromUrl(url) {
  try {
    return new URL(url.trim().replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return null;
  }
}

async function main() {
  const token = JSON.parse(
    readFileSync(join(process.env.HOME ?? '', 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8'),
  ).token;
  const staging = parse(readFileSync('.env.staging.local', 'utf8'));
  const hairUrl = staging.HAIR_DATABASE_URL?.trim();
  const platUrl = staging.PLATFORM_DATABASE_URL?.trim();
  if (!hairUrl || !platUrl) throw new Error('.env.staging.local missing HAIR_DATABASE_URL or PLATFORM_DATABASE_URL');
  const hairHost = hostFromUrl(hairUrl);
  const platHost = hostFromUrl(platUrl);
  if (!hairHost || hairHost.includes(PROD_FRAG)) throw new Error('Refusing production Hair URL');
  if (hairHost === platHost) throw new Error('Hair and Platform hosts must differ');
  console.log('Hair host:', hairHost);
  console.log('Platform host:', platHost);

  async function api(path, opts = {}) {
    const res = await fetch(`https://api.vercel.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} ${res.status} ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  }

  const existing = await api(`/v9/projects/${PROJECT_ID}/env?decrypt=true`);
  const envs = existing.envs ?? [];

  async function upsertPreview(key, value) {
    const matches = envs.filter((e) => e.key === key && e.target?.includes('preview'));
    for (const row of matches) {
      await api(`/v9/projects/${PROJECT_ID}/env/${row.id}`, { method: 'DELETE' });
      console.log('Removed old preview env:', key);
    }
    await api(`/v10/projects/${PROJECT_ID}/env`, {
      method: 'POST',
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['preview'] }),
    });
    console.log('Set preview env:', key);
  }

  await upsertPreview('HAIR_DATABASE_URL', hairUrl);
  await upsertPreview('PLATFORM_DATABASE_URL', platUrl);
  await upsertPreview('FYH_SAAS_TENANT', '1');
  await upsertPreview('WORKFORCE_MEMBERSHIP_AUTH', '1');

  const prod = envs.filter((e) => e.target?.includes('production'));
  for (const key of ['FYH_SAAS_TENANT', 'WORKFORCE_MEMBERSHIP_AUTH']) {
    const row = prod.find((e) => e.key === key);
    const v = row?.value?.trim() || '(unset)';
    console.log(`Production ${key}:`, v);
  }
  console.log('✓ Preview staging env configured');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
