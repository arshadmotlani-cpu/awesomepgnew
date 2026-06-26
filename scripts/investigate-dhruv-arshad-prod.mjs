/**
 * Production checkout investigation via admin session cookies.
 * Usage: node scripts/investigate-dhruv-arshad-prod.mjs
 * Optional: REPAIR=1 node scripts/investigate-dhruv-arshad-prod.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const OUT = join(process.cwd(), 'public/assets/checkout-investigation');
mkdirSync(OUT, { recursive: true });

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name == 'apg_admin_session':
        out.append({
            'name': c.name,
            'value': c.value,
            'domain': c.domain,
            'path': c.path or '/',
            'expires': c.expires,
            'httpOnly': True,
            'secure': bool(c.secure),
            'sameSite': 'Lax',
        })
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(raw.trim());
}

function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function main() {
  const cookies = loadAdminCookies();
  if (!cookies.length) throw new Error('apg_admin_session cookie not found');

  const headers = { Cookie: cookieHeader(cookies), Accept: 'application/json' };

  const getRes = await fetch(`${BASE}/api/admin/checkout-investigation`, { headers });
  const getJson = await getRes.json();
  writeFileSync(join(OUT, 'investigation.json'), JSON.stringify(getJson, null, 2));

  let repairJson = null;
  if (process.env.REPAIR === '1') {
    const postRes = await fetch(`${BASE}/api/admin/checkout-investigation`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    repairJson = await postRes.json();
    writeFileSync(join(OUT, 'repair.json'), JSON.stringify(repairJson, null, 2));
  }

  console.log(JSON.stringify({ ok: getJson.ok, repair: repairJson?.ok ?? null, outDir: OUT }, null, 2));
  if (!getRes.ok) process.exit(1);
}

await main();
