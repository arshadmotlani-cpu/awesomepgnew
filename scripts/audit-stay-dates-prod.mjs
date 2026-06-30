/**
 * Production stay-date integrity audit via admin session cookie.
 * Usage: node scripts/audit-stay-dates-prod.mjs
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';

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

  const res = await fetch(`${BASE}/api/admin/booking-stay-date-integrity`, {
    headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status, text.slice(0, 500));
    process.exit(1);
  }
  const json = JSON.parse(text);
  console.log(
    JSON.stringify(
      {
        issueBookingCount: json.issueBookingCount,
        affectedResidentCount: json.affectedResidentCount,
        repairableBookingCount: json.repairableBookingCount,
        repairableResidentCount: json.repairableResidentCount,
        residents: json.residents,
      },
      null,
      2,
    ),
  );
}

await main();
