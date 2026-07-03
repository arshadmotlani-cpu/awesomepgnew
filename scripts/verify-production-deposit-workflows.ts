/* eslint-disable no-console */
/**
 * Production manual verification checklist for Refund + Deposit Express.
 * Uses Chrome admin session (Profile 6). Reports pass/fail per step.
 */
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';

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

function log(section: string, step: string, pass: boolean, detail = '') {
  console.log(`${pass ? '✓' : '✗'} [${section}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function assertNoCrash(page: Page, section: string, step: string) {
  const body = await page.locator('body').innerText();
  const pass = !body.includes('This page could not load');
  log(section, step, pass, pass ? '' : 'Server Components crash');
  return pass;
}

async function main() {
  const cookie = loadAdminCookies();
  if (!cookie) throw new Error('No apg_admin_session cookie');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), domain: 'www.awesomepg.in', path: '/' };
    }),
  );
  const page = await context.newPage();

  // ── Refund of Deposit ─────────────────────────────────────────────────────
  const REFUND = 'Refund';
  await page.goto(`${BASE}/admin/refunds`, { waitUntil: 'networkidle', timeout: 60000 });
  await assertNoCrash(page, REFUND, 'Page loads');
  await page.getByPlaceholder('Name, phone, or booking code').fill('harshal');
  await page.waitForTimeout(900);
  log(REFUND, 'Search returns results', (await page.locator('ul button').count()) > 0);
  await page.locator('ul button').first().click();
  await page.waitForTimeout(8000);
  await assertNoCrash(page, REFUND, 'Select resident — no crash');
  const refundBody = await page.locator('body').innerText();
  log(REFUND, 'Workspace opens', refundBody.includes('Refund workspace'));
  log(REFUND, 'Wallet visible', /Wallet|Remaining|Deposit paid/i.test(refundBody));
  log(REFUND, 'Deduction section present', /Deduction|Apply deduction/i.test(refundBody));
  log(REFUND, 'Refund action present', /Mark refund|Refund payout|final refund/i.test(refundBody));

  const refundBookingId = new URL(page.url()).searchParams.get('booking');
  if (refundBookingId) {
    await page.goto(`${BASE}/admin/refunds?booking=${refundBookingId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await assertNoCrash(page, REFUND, 'Deep link ?booking= loads');
    const deep = await page.locator('body').innerText();
    log(REFUND, 'Deep link workspace', deep.includes('Refund workspace'));
  }

  // ── Deposit Express ───────────────────────────────────────────────────────
  const DEP = 'Deposit Express';
  await page.goto(`${BASE}/admin/deposit-express`, { waitUntil: 'networkidle', timeout: 60000 });
  await assertNoCrash(page, DEP, 'Page loads');
  await page.getByPlaceholder('Start typing…').fill('harshal');
  await page.waitForTimeout(1000);
  log(DEP, 'Search returns results', (await page.locator('[data-deposit-express-workspace] ul button').count()) > 0);

  const harshalBtn = page
    .locator('[data-deposit-express-workspace] ul button')
    .filter({ hasText: 'Harshal' })
    .first();
  if ((await harshalBtn.count()) > 0) {
    await harshalBtn.click();
  } else {
    await page.locator('[data-deposit-express-workspace] ul button').first().click();
  }
  await page.waitForTimeout(10000);
  await assertNoCrash(page, DEP, 'Select resident — no crash');
  const depBody = await page.locator('body').innerText();
  log(DEP, 'Workspace opens', depBody.includes('Record deposit'));
  log(DEP, 'Required deposit shown', depBody.includes('Required deposit'));
  log(DEP, 'Already paid shown', depBody.includes('Already paid'));
  log(DEP, 'Remaining due shown', depBody.includes('Remaining due'));
  log(DEP, 'Wallet balance shown', depBody.includes('Wallet balance'));

  const depBookingId = new URL(page.url()).searchParams.get('booking') ?? '090692ca-71a6-44ab-9f11-9dbdc9366114';
  await page.goto(`${BASE}/admin/deposit-express?booking=${depBookingId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await assertNoCrash(page, DEP, 'Deep link ?booking= loads');
  const depDeep = await page.locator('body').innerText();
  log(DEP, 'Deep link workspace', depDeep.includes('Record deposit') || depDeep.includes('Required deposit'));

  console.log('\nNote: Payment submission, invoice generation, and refund mark-paid were not executed on production (would mutate live data). UI load paths verified above.');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
