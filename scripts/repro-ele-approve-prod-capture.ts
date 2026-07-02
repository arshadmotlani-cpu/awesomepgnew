/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = 'https://www.awesomepg.in';
const INVOICE = 'ELE-2026-06-0035';
const ELEC_ID = 'c024f94a-c7e0-4cf3-912c-4affeb63d2b1';
const PG_ID = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';

function cookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import browser_cookie3
cf = __import__('pathlib').Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
print(';'.join(c.name+'='+c.value for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in') if c.name=='apg_admin_session'))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim();
}

async function main() {
  const cookie = cookies();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), domain: 'www.awesomepg.in', path: '/' };
    }),
  );
  const page = await context.newPage();

  const posts: Array<{ status: number; ct: string; body: string; url: string; headers: Record<string, string> }> = [];

  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/admin/operations')) {
      console.log('POST req headers:', JSON.stringify({
        'next-action': req.headers()['next-action'],
        'content-type': req.headers()['content-type'],
      }));
    }
  });

  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST') return;
    const url = req.url();
    if (!url.includes('awesomepg.in')) return;
    const body = await res.text().catch(() => '');
    posts.push({
      status: res.status(),
      ct: res.headers()['content-type'] ?? '',
      body: body.slice(0, 3000),
      url,
      headers: req.headers(),
    });
    console.log('\n===== POST RESPONSE =====');
    console.log('url:', url);
    console.log('status:', res.status());
    console.log('content-type:', res.headers()['content-type']);
    console.log('body start:', body.slice(0, 1500));
  });

  await page.goto(`${BASE}/admin/operations?filter=payment_proof&focus=elec-${ELEC_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  // Wait until Angatra invoice visible
  await page.getByText(INVOICE).first().waitFor({ timeout: 60_000 }).catch(() => null);
  const has = await page.getByText(INVOICE).isVisible().catch(() => false);
  console.log('invoice visible:', has);

  const approve = page.getByRole('button', { name: /^approve$/i }).first();
  await approve.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('clicking approve...');
  const t0 = Date.now();
  await approve.click();
  await page.waitForTimeout(90_000);
  console.log('elapsed ms:', Date.now() - t0);

  const err = await page.getByText(/unexpected response|approval failed/i).first().textContent().catch(() => null);
  console.log('UI error:', err ?? '(none)');
  console.log('captured posts:', posts.length);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
