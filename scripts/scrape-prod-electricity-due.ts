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
  if (!cookie) {
    console.error('No apg_admin_session');
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

  await page.goto(`${BASE}/admin/operations?filter=electricity_due`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });

  const body = await page.locator('body').innerText();
  console.log('=== Electricity Due page text (excerpt) ===');
  const lines = body.split('\n').filter((l) => /ishan|anuj|harinkhede|electricity|₹|ELE-/i.test(l));
  console.log(lines.slice(0, 40).join('\n') || '(no matching lines)');

  const cards = page.locator('[data-testid="operations-queue-item"], article, li').filter({
    hasText: /ishan|harinkhede|anuj/i,
  });
  console.log('\nMatching card count:', await cards.count());

  for (const id of [
    'cd683882-87cf-4cb4-9690-587b6537617b',
    '9e7ee271-a1ab-46c7-b436-239744597264',
    '1d03d0bd-38c9-42c5-a2e3-e956c4e5bec7',
    '23c95c00-fc9b-45cd-9700-40e6b00a5559',
  ]) {
    await page.goto(`${BASE}/admin/invoices/${id}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const text = await page.locator('body').innerText();
    const statusMatch = text.match(/Status[^\n]*\n([^\n]+)/i) ?? text.match(/(Paid|Pending|Cancelled|Overdue|Sent)/);
    console.log(`\nInvoice ${id.slice(0, 8)}… status hint:`, statusMatch?.[1]?.trim() ?? 'unknown');
    console.log('  has Cancel invoice:', /Cancel invoice/.test(text));
    console.log('  invoice number:', text.match(/ELE-[\d-]+/)?.[0] ?? text.match(/INV-[\d-]+/)?.[0] ?? '?');
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
