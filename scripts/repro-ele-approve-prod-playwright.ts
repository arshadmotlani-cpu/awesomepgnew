/* eslint-disable no-console */
/**
 * Production HTTP repro for electricity payment proof approval.
 * Finds ELE-2026-06-0035 on operations page and clicks Approve.
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const INVOICE = process.env.TARGET_INVOICE ?? 'ELE-2026-06-0035';

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
      return {
        name,
        value: rest.join('='),
        domain: 'www.awesomepg.in',
        path: '/',
      };
    }),
  );

  const page = await context.newPage();
  const actionResponses: Array<{
    status: number;
    contentType: string | null;
    bodyPreview: string;
    url: string;
  }> = [];

  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST') return;
    const url = res.url();
    if (!url.includes('awesomepg.in')) return;
    const ct = res.headers()['content-type'] ?? null;
    let bodyPreview = '';
    try {
      bodyPreview = (await res.text()).slice(0, 1200);
    } catch {
      bodyPreview = '<unreadable>';
    }
    actionResponses.push({ status: res.status(), contentType: ct, bodyPreview, url });
    console.log('\n=== POST RESPONSE ===');
    console.log('url:', url);
    console.log('status:', res.status());
    console.log('content-type:', ct);
    console.log('body:', bodyPreview);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('browser console error:', msg.text());
  });

  const opsUrl = `${BASE}/admin/operations?filter=payment_proof`;
  console.log('Loading', opsUrl);
  const nav = await page.goto(opsUrl, { waitUntil: 'networkidle', timeout: 90_000 });
  console.log('page status:', nav?.status());

  const html = await page.content();
  const hasInvoice = html.includes(INVOICE);
  const hasAngatra = /angatra/i.test(html);
  console.log('has invoice', INVOICE, ':', hasInvoice);
  console.log('has Angatra:', hasAngatra);

  if (!hasInvoice) {
    // try focus search in all pending items text
    const text = await page.locator('body').innerText();
    const elecLines = text.split('\n').filter((l) => /electricity|ELE-|angatra|room 202/i.test(l));
    console.log('relevant lines:', elecLines.slice(0, 30));
  }

  const approveBtn = page.getByRole('button', { name: /^approve$/i }).first();
  const visible = await approveBtn.isVisible().catch(() => false);
  console.log('approve button visible:', visible);

  if (!visible) {
    await browser.close();
    process.exit(1);
  }

  await approveBtn.click();
  await page.waitForTimeout(8000);

  const err = await page
    .getByText(/unexpected response|approval failed/i)
    .first()
    .textContent()
    .catch(() => null);
  console.log('\nUI error:', err ?? '(none)');

  if (actionResponses.length === 0) {
    console.error('No POST responses captured');
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
