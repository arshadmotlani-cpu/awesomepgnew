/* eslint-disable no-console */
/** Capture server-action errors when loading refund workspace on production. */
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

  const actionPosts: Array<{ status: number; body: string; url: string }> = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST' || !res.url().includes('/admin/refunds')) return;
    let body = '';
    try {
      body = (await res.text()).slice(0, 4000);
    } catch {
      body = '<unreadable>';
    }
    actionPosts.push({ status: res.status(), body, url: res.url() });
  });

  await page.goto(`${BASE}/admin/refunds`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Name, phone, or booking code').fill(process.argv[2] ?? 'harshal');
  await page.waitForTimeout(1000);

  const searchBtn = page.locator('[data-refund-console-workspace] ul.overflow-hidden button').first();
  const hasResult = (await searchBtn.count()) > 0;
  if (!hasResult) {
    console.log('No search results in workspace list');
    await browser.close();
    return;
  }

  const label = await searchBtn.innerText();
  console.log('Selecting:', label.replace(/\s+/g, ' ').slice(0, 80));
  await searchBtn.click();
  await page.waitForTimeout(8000);

  console.log('\nPOST /admin/refunds responses:');
  for (const p of actionPosts) {
    console.log('status:', p.status);
    console.log('body:', p.body.slice(0, 1500));
    console.log('---');
  }

  const bookingId = new URL(page.url()).searchParams.get('booking');
  if (bookingId) {
    console.log('\nDirect deep link test:', bookingId);
    actionPosts.length = 0;
    const res = await page.goto(`${BASE}/admin/refunds?booking=${bookingId}`, {
      waitUntil: 'networkidle',
    });
    console.log('GET status:', res?.status());
    const body = await page.locator('body').innerText();
    console.log('crash:', body.includes('This page could not load'));
    console.log('workspace:', body.includes('Refund workspace'));
    for (const p of actionPosts) {
      console.log('POST status:', p.status, p.body.slice(0, 500));
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
