/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const INVOICE = 'ELE-2026-06-0035';

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import browser_cookie3
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
const res = await fetch(`${BASE}/admin/operations?filter=payment_proof`, {
  headers: { Cookie: cookie },
});
const html = await res.text();
console.log('HTTP', res.status);
console.log('has invoice:', html.includes(INVOICE));
console.log('has unexpected:', /unexpected response/i.test(html));

// Extract elec- UUID keys near invoice number
const idx = html.indexOf(INVOICE);
if (idx >= 0) {
  const slice = html.slice(Math.max(0, idx - 2000), idx + 2000);
  const keys = [...slice.matchAll(/elec-[0-9a-f-]{36}/gi)].map((m) => m[0]);
  console.log('nearby elec keys:', [...new Set(keys)]);
  console.log('context snippet:', slice.replace(/\s+/g, ' ').slice(0, 800));
}

// Count approve buttons in HTML (rough)
const approveCount = (html.match(/Approve/gi) ?? []).length;
console.log('Approve mentions:', approveCount);
