/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = 'https://www.awesomepg.in';

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
  await page.goto(`${BASE}/admin/operations?filter=electricity_due`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });

  const links = await page.locator('a[href]').evaluateAll((els) =>
    els.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() ?? '' })),
  );

  console.log('=== Links on electricity_due page ===');
  for (const l of links.filter((l) => /ishan|anuj|harinkhede|electricity|invoice|ELE/i.test(l.text + l.href))) {
    console.log(l.text.slice(0, 60), '→', l.href);
  }

  const allHrefs = links.map((l) => l.href).filter((h) => /invoice|electricity|resident|operations/i.test(h));
  console.log('\nAll invoice/electricity hrefs:', [...new Set(allHrefs)]);

  await browser.close();
}

main();
