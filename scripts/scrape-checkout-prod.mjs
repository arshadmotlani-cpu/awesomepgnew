/**
 * Scrape production checkout/vacating HTML for Dhruv and Arshad rows.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://www.awesomepg.in';
const OUT = join(process.cwd(), 'public/assets/checkout-investigation');

function cookieHeader() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
print(';'.join(c.name+'='+c.value for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in') if c.name=='apg_admin_session'))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim();
}

async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader(), Accept: 'text/html' },
    redirect: 'follow',
  });
  return { status: res.status, url: res.url, text: await res.text() };
}

function extractSnippets(text, names) {
  const out = {};
  for (const name of names) {
    const idx = text.toLowerCase().indexOf(name.toLowerCase());
    if (idx >= 0) out[name] = text.slice(Math.max(0, idx - 200), idx + 1200);
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const cookie = cookieHeader();
if (!cookie) throw new Error('no admin cookie');

const [vacating, settlements, live] = await Promise.all([
  fetchText('/admin/vacating'),
  fetchText('/admin/checkout-settlements'),
  fetch(`${BASE}/api/admin/live`, { headers: { Cookie: cookie } }).then((r) => r.json()),
]);

const names = ['dhruv', 'arshad', 'motlani', '102', '203', 'B3', 'B4'];
const report = {
  live,
  vacatingLogin: vacating.url.includes('/admin/login'),
  settlementsLogin: settlements.url.includes('/admin/login'),
  vacatingSnippets: extractSnippets(vacating.text, names),
  settlementsSnippets: extractSnippets(settlements.text, names),
  noticeMatches: [...settlements.text.matchAll(/Notice deduction[^₹]*₹\s*([\d,]+)/gi)].map((m) => m[0]),
  depositMatches: [...settlements.text.matchAll(/Deposit[^₹]*₹\s*([\d,]+)/gi)].map((m) => m[0]).slice(0, 10),
};

writeFileSync(join(OUT, 'scrape.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
