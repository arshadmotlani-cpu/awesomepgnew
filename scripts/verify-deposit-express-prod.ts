/* eslint-disable no-console */
/** Post-deploy smoke test for Deposit Express. Requires Chrome admin session (Profile 6). */
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
  if (!cookie) {
    console.error('No apg_admin_session cookie');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), domain: 'www.awesomepg.in', path: '/' };
    }),
  );
  const page = await context.newPage();

  await page.goto(`${BASE}/admin/deposit-express`, { waitUntil: 'networkidle', timeout: 60000 });

  const query = process.env.DEPOSIT_EXPRESS_SEARCH_QUERY ?? 'harshal';
  await page.getByPlaceholder('Start typing…').fill(query);
  await page.waitForTimeout(1000);

  const resultBtn = page
    .locator('[data-deposit-express-workspace] ul button')
    .filter({ hasText: query.split(' ')[0] ?? query })
    .first();
  if ((await resultBtn.count()) === 0 && (await page.locator('[data-deposit-express-workspace] ul button').count()) === 0) {
    console.log('No search results — set DEPOSIT_EXPRESS_SEARCH_QUERY');
    await browser.close();
    return;
  }

  if ((await resultBtn.count()) > 0) {
    await resultBtn.click();
  } else {
    await page.locator('[data-deposit-express-workspace] ul button').first().click();
  }
  await page.waitForTimeout(10000);

  const body = await page.locator('body').innerText();
  if (body.includes('This page could not load')) {
    console.error('Server Components crash after booking select');
    console.error(body.slice(0, 800));
    process.exit(1);
  }
  if (!(await page.getByText('Record deposit').isVisible())) {
    console.error(body.slice(0, 1200));
    throw new Error('Deposit Express workspace did not open');
  }

  const bookingId = new URL(page.url()).searchParams.get('booking') ?? '090692ca-71a6-44ab-9f11-9dbdc9366114';
  await page.goto(`${BASE}/admin/deposit-express?booking=${bookingId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  const body2 = await page.locator('body').innerText();
  if (body2.includes('This page could not load') || !(await page.getByText('Record deposit').isVisible())) {
    throw new Error('Deep link ?booking= failed');
  }

  console.log('✓ Deposit Express flow OK');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
