/**
 * Fetch production Dhruv resident page with Chrome admin session.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const CUSTOMER_ID = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name == 'apg_admin_session':
        out.append(c.name + '=' + c.value)
print(';'.join(out))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 }).trim();
}

const cookie = loadAdminCookies();
if (!cookie) {
  console.error('No apg_admin_session cookie');
  process.exit(1);
}

const url = `${BASE}/admin/residents/${CUSTOMER_ID}`;
const res = await fetch(url, { headers: { Cookie: cookie }, redirect: 'follow' });
const html = await res.text();

console.log('HTTP', res.status, res.url);
if (html.includes('could not load')) {
  console.log('\n=== ERROR BOUNDARY DETECTED ===\n');
  const digest = html.match(/digest[^<]{0,120}/i)?.[0];
  if (digest) console.log(digest);
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  if (pre) console.log(pre.slice(0, 2000));
} else if (html.includes('Command center') || html.includes('Current stay') || html.includes('Dhruv')) {
  console.log('Page appears to load (found resident content markers)');
} else {
  console.log(html.slice(0, 800));
}
