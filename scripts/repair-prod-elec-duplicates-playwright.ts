/* eslint-disable no-console */
/**
 * Production repair: cancel duplicate pending electricity invoices via admin invoice pages.
 * Targets Ishan Jharia (ELE-2026-06-0032) and Anuj Harinkhede (ELE-2026-06-0030).
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const TARGETS = [
  { name: 'Ishan Jharia', financialInvoiceId: 'cd683882-87cf-4cb4-9690-587b6537617b' },
  { name: 'Anuj Harinkhede', financialInvoiceId: '9e7ee271-a1ab-46c7-b436-239744597264' },
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

  for (const target of TARGETS) {
    const url = `${BASE}/admin/invoices/${target.financialInvoiceId}`;
    console.log('\n===', target.name, url, '===');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
    const cancelBtn = page.getByRole('button', { name: /cancel invoice/i });
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      const confirm = page.getByRole('button', { name: /confirm|yes|cancel invoice/i }).last();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }
      await page.waitForTimeout(2000);
      console.log('Clicked cancel');
    } else {
      const text = await page.locator('body').innerText();
      console.log('No cancel button. Status hints:', text.includes('Paid') ? 'Paid' : '', text.includes('Cancelled') ? 'Cancelled' : '');
    }
  }

  const ops = await (await fetch(`${BASE}/admin/operations?filter=electricity_due`, {
    headers: { Cookie: cookie },
  })).text();
  console.log('\n=== Post-repair electricity_due ===');
  console.log('Ishan in queue:', /ishan/i.test(ops));
  console.log('Anuj/Harinkhede in queue:', /harinkhede|anuj/i.test(ops));
  console.log('electricity_due count snippet:', ops.match(/Electricity due[^)]*\(\s*(\d+)/i)?.[1] ?? '?');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
