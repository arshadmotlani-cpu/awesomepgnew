/* eslint-disable no-console */
/**
 * Settle remaining electricity balance on production for Ishan + Anuj (late-fee remainder after proof approval).
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = 'https://www.awesomepg.in';
const RESIDENTS = [
  { name: 'Ishan Jharia', id: '88e44b38-d4fb-4011-aa17-b86bedd728c2' },
  { name: 'Anuj Harinkhede', id: 'd2c970f9-9c7b-4a53-90ce-bec17236700b' },
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

async function settleResident(page: import('playwright').Page, resident: { name: string; id: string }) {
  const url = `${BASE}/admin/residents/${resident.id}#open-bills`;
  console.log(`\n=== ${resident.name} ===`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });

  const dueText = await page.locator('body').innerText();
  if (!/ELECTRICITY DUE/i.test(dueText)) {
    console.log('No ELECTRICITY DUE banner — already clear');
    return;
  }

  const cashBtn = page.getByRole('button', { name: 'Mark as Paid (Cash)' }).first();
  if (!(await cashBtn.isVisible().catch(() => false))) {
    console.log('No Mark as Paid button visible');
    return;
  }

  await cashBtn.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  const notes = dialog.locator('textarea, input[name="notes"]');
  if (await notes.count()) {
    await notes.first().fill('Late fee remainder — proof already approved; ops repair Jul 2026');
  }

  await dialog.getByRole('button', { name: /confirm|mark as paid/i }).click();
  await page.waitForTimeout(3000);
  console.log('Submitted cash settlement');
}

async function verifyElectricityDue(page: import('playwright').Page) {
  await page.goto(`${BASE}/admin/operations?filter=electricity_due`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });
  const text = await page.locator('body').innerText();
  const count = text.match(/Electricity due\s*\((\d+)\)/i)?.[1] ?? '?';
  console.log('\n=== Electricity Due count:', count, '===');
  console.log('Ishan:', /ishan/i.test(text));
  console.log('Anuj:', /harinkhede|anuj/i.test(text));
  return count === '0';
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
    await settleResident(page, r);
  }

  const ok = await verifyElectricityDue(page);
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
