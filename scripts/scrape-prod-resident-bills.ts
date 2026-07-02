/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = 'https://www.awesomepg.in';
const RESIDENTS = [
  { name: 'Ishan', id: '88e44b38-d4fb-4011-aa17-b86bedd728c2' },
  { name: 'Anuj', id: 'd2c970f9-9c7b-4a53-90ce-bec17236700b' },
];

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
print(';'.join(c.name + '=' + c.value for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in') if c.name == 'apg_admin_session'))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 }).trim();
}

async function main() {
  const cookie = loadAdminCookies();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), domain: 'www.awesomepg.in', path: '/' };
    }),
  );
  const page = await context.newPage();

  for (const r of RESIDENTS) {
    const url = `${BASE}/admin/residents/${r.id}#open-bills`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
    const text = await page.locator('body').innerText();
    console.log(`\n=== ${r.name} (${r.id.slice(0, 8)}) ===`);
    const elecLines = text.split('\n').filter((l) => /ELE-|electricity|826|827|paid|pending|proof|june/i.test(l));
    console.log(elecLines.slice(0, 30).join('\n'));

    const links = await page.locator('a[href*="/admin/invoices/"]').evaluateAll((els) =>
      els.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() ?? '' })),
    );
    console.log('Invoice links:');
    for (const l of links) console.log(' ', l.text, l.href);
  }

  await browser.close();
}

main();
