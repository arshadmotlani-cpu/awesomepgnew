/* eslint-disable no-console */
/** Test every harshal search result + deep link on production. */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';

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

  const rscErrors: string[] = [];
  page.on('pageerror', (err) => rscErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') rscErrors.push(msg.text());
  });

  await page.goto(`${BASE}/admin/refunds`, { waitUntil: 'networkidle' });
  const query = process.argv[2] ?? 'harshal';
  await page.getByPlaceholder('Name, phone, or booking code').fill(query);
  await page.waitForTimeout(1000);

  const count = await page.locator('ul button').count();
  console.log(`Found ${count} results for "${query}"`);
  const limit = Math.min(count, Number(process.env.REFUND_TEST_LIMIT ?? 15));

  for (let i = 0; i < limit; i++) {
    await page.goto(`${BASE}/admin/refunds`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Name, phone, or booking code').fill(query);
    await page.waitForTimeout(800);
    const btn = page.locator('ul button').nth(i);
    const label = (await btn.innerText()).replace(/\s+/g, ' ').trim();
    await btn.click();
    await page.waitForTimeout(6000);
    const body = await page.locator('body').innerText();
    const crashed = body.includes('This page could not load');
    const workspace = body.includes('Refund workspace');
    const url = page.url();
    const bookingId = new URL(url).searchParams.get('booking');
    console.log(`[select ${i + 1}] ${label.slice(0, 60)} → workspace=${workspace} crash=${crashed}`);
    if (crashed) {
      console.error('BODY:', body.slice(0, 600));
      await browser.close();
      process.exit(1);
    }
    if (bookingId) {
      await page.goto(`${BASE}/admin/refunds?booking=${bookingId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      const body2 = await page.locator('body').innerText();
      const crashed2 = body2.includes('This page could not load');
      const workspace2 = body2.includes('Refund workspace');
      console.log(`  [deep link] booking=${bookingId.slice(0, 8)}… workspace=${workspace2} crash=${crashed2}`);
      if (crashed2 || !workspace2) {
        console.error('DEEP LINK BODY:', body2.slice(0, 800));
        await browser.close();
        process.exit(1);
      }
    }
  }

  if (rscErrors.length) console.log('page errors:', rscErrors.slice(0, 5));
  console.log(`✓ ${limit} residents tested`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
