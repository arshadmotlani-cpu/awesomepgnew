/**
 * Production post-login crash probe via admin session.
 * Usage: node scripts/probe-post-login-prod.mjs
 *        node scripts/probe-post-login-prod.mjs --email user@example.com
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const emailArg = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name == 'apg_admin_session':
        out.append({'name': c.name, 'value': c.value})
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(raw.trim());
}

async function main() {
  const cookies = loadAdminCookies();
  if (!cookies.length) throw new Error('apg_admin_session cookie not found');

  const qs = emailArg ? `?email=${encodeURIComponent(emailArg)}` : '';
  const res = await fetch(`${BASE}/api/admin/post-login-probe${qs}`, {
    headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status, text.slice(0, 800));
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(text), null, 2));
}

await main();
