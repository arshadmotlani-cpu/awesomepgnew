/**
 * Production deposit save verification for booking E352.
 * Uses Chrome profile when available, else ADMIN_EMAIL + ADMIN_PASSWORD env vars.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const BOOKING_ID = process.env.BOOKING_ID ?? 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const OUT = join(process.cwd(), 'artifacts/deposit-prod-verify');
mkdirSync(OUT, { recursive: true });

const result = {
  status: 'unknown',
  bookingId: BOOKING_ID,
  base: BASE,
  depositCorrectFormRendered: false,
  depositComponentFailed: false,
  consoleErrors: [],
  pageErrors: [],
  valuesAfterSave: {},
  refreshOk: false,
  screenshots: {},
  pageTextAfterSave: '',
  pageTextAfterRefresh: '',
  loginRequired: false,
  error: null,
};

function extractAmounts(text) {
  const required =
    text.match(/Required[\s\S]{0,80}?₹\s*([\d,]+(?:\.\d+)?)/i)?.[1] ??
    text.match(/Required deposit[\s\S]{0,40}?([\d,]+)/i)?.[1];
  const collected =
    text.match(/Collected[\s\S]{0,80}?₹\s*([\d,]+(?:\.\d+)?)/i)?.[1] ??
    text.match(/Collected deposit[\s\S]{0,40}?([\d,]+)/i)?.[1];
  return { required, collected };
}

async function adminLogin(page) {
  const email = process.env.ADMIN_EMAIL ?? process.env.PROD_ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD ?? process.env.PROD_ADMIN_PASSWORD;
  if (!email || !password) return false;

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(2500);
  return !page.url().includes('/admin/login');
}

function loadChromeAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name in ('apg_admin_session', 'apg_visitor_session'):
        out.append({
            'name': c.name,
            'value': c.value,
            'domain': c.domain,
            'path': c.path or '/',
            'expires': c.expires,
            'httpOnly': bool(getattr(c, '_rest', {}).get('HttpOnly')) or c.name.startswith('apg_'),
            'secure': bool(c.secure),
            'sameSite': 'Lax',
        })
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(raw.trim());
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    const cookies = loadChromeAdminCookies();
    if (!cookies.some((c) => c.name === 'apg_admin_session')) {
      throw new Error('apg_admin_session cookie not found in Chrome profile');
    }
    await context.addCookies(cookies);
    result.usedChromeCookies = true;
  } catch (err) {
    result.cookieError = err instanceof Error ? err.message : String(err);
  }

  const page = context.pages()[0] ?? (await context.newPage());

  page.on('console', (msg) => {
    const text = msg.text();
    if (/DEPOSIT_COMPONENT_FAILED|error|failed/i.test(text)) {
      result.consoleErrors.push(`[${msg.type()}] ${text}`);
    }
    if (text.includes('DEPOSIT_COMPONENT_FAILED')) {
      result.depositComponentFailed = true;
    }
  });

  page.on('pageerror', (err) => {
    result.pageErrors.push(err.message);
    if (err.message.includes('DEPOSIT_COMPONENT_FAILED')) {
      result.depositComponentFailed = true;
    }
  });

  try {
    const depositUrl = `${BASE}/admin/deposits/${BOOKING_ID}`;
    await page.goto(depositUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/admin/login')) {
      result.loginRequired = true;
      const loggedIn = await adminLogin(page);
      if (!loggedIn) {
        result.error = 'Admin login required; set ADMIN_EMAIL and ADMIN_PASSWORD';
        result.status = 'blocked';
        await page.screenshot({ path: join(OUT, 'login-required.png'), fullPage: true });
        result.screenshots.loginRequired = 'login-required.png';
        writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
        process.exit(2);
      }
      await page.goto(depositUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: join(OUT, '01-before-save.png'), fullPage: true });
    result.screenshots.beforeSave = '01-before-save.png';

    const beforeText = await page.locator('body').innerText();
    result.valuesBefore = extractAmounts(beforeText);

    const correctHeading = page.getByRole('heading', { name: /correct deposit/i });
    const unavailable = page.getByText(/deposit data unavailable/i);

    if (await unavailable.isVisible().catch(() => false)) {
      result.depositCorrectFormRendered = false;
      result.error = 'DepositCorrectForm showed unavailable state before save';
    } else if (await correctHeading.isVisible().catch(() => false)) {
      result.depositCorrectFormRendered = true;
    }

    const correctSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /correct deposit/i }) });
    const requiredInput = correctSection.locator('input[name="requiredInr"]');
    const collectedInput = correctSection.locator('input[name="collectedInr"]');
    const reasonInput = correctSection.locator('input[name="reason"]');

    await requiredInput.fill('4500');
    await collectedInput.fill('4500');
    await reasonInput.fill(`Production verification ${new Date().toISOString()}`);

    const saveBtn = correctSection.getByRole('button', { name: /save corrections/i });
    await saveBtn.click();

    await page.waitForURL(/\/admin\/deposits\/.*(?:saved=1|depositError=)/, { timeout: 90000 }).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(() => undefined);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: join(OUT, '02-after-save.png'), fullPage: true });
    result.screenshots.afterSave = '02-after-save.png';

    result.pageTextAfterSave = await page.locator('body').innerText();
    result.valuesAfterSave = extractAmounts(result.pageTextAfterSave);

    const errorBoundary = page.getByText(/deposit details could not load|server hit an error|something went wrong|application error/i);
    if (await errorBoundary.isVisible().catch(() => false)) {
      result.depositComponentFailed = true;
      result.error = 'Error boundary visible after save';
    }

    const afterSaveCrash = await page.getByText(/deposit details could not load/i).isVisible().catch(() => false);
    if (afterSaveCrash) {
      result.depositComponentFailed = true;
      result.error = result.error ?? 'Deposit error boundary after save';
    }

    if (await unavailable.isVisible().catch(() => false)) {
      result.depositCorrectFormRendered = false;
    } else if (await correctHeading.isVisible().catch(() => false)) {
      result.depositCorrectFormRendered = true;
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: join(OUT, '03-after-refresh.png'), fullPage: true });
    result.screenshots.afterRefresh = '03-after-refresh.png';

    result.pageTextAfterRefresh = await page.locator('body').innerText();
    result.valuesAfterRefresh = extractAmounts(result.pageTextAfterRefresh);

    const crashAfterRefresh =
      (await errorBoundary.isVisible().catch(() => false)) ||
      (await unavailable.isVisible().catch(() => false) &&
        result.pageTextAfterRefresh.includes('Deposit data unavailable'));

    result.refreshOk =
      !crashAfterRefresh &&
      !result.depositComponentFailed &&
      (await correctHeading.isVisible().catch(() => false));

    const persisted4500 =
      (result.valuesAfterSave.required &&
        result.valuesAfterSave.collected &&
        [result.valuesAfterSave.required, result.valuesAfterSave.collected].every(
          (v) => v.replace(/,/g, '') === '4500',
        )) ||
      (result.valuesAfterRefresh.required &&
        result.valuesAfterRefresh.collected &&
        [result.valuesAfterRefresh.required, result.valuesAfterRefresh.collected].every(
          (v) => v.replace(/,/g, '') === '4500',
        ));

    result.persisted4500 = persisted4500;

    const pass =
      result.depositCorrectFormRendered &&
      !result.depositComponentFailed &&
      persisted4500 &&
      result.refreshOk;

    result.status = pass ? 'FIX VERIFIED' : 'STILL FAILING';
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.status = 'STILL FAILING';
    await page.screenshot({ path: join(OUT, 'error.png'), fullPage: true }).catch(() => undefined);
  } finally {
    writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'FIX VERIFIED' ? 0 : 1);
  }
}

await main();
