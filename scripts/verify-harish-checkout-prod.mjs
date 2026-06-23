/**
 * Post-deploy production verification — Harish APG-2026-0016 checkout.
 * Uses Chrome Profile 6 admin cookies when available.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const BOOKING_CODE = process.env.BOOKING_CODE ?? 'APG-2026-0016';
const OUT = join(process.cwd(), 'public/assets/prod-verify-harish-2026-06-23');
mkdirSync(OUT, { recursive: true });

const checklist = {
  A_adminSession: 'BLOCKED',
  B_settlementAmounts: 'BLOCKED',
  C_completeCheckout: 'BLOCKED',
  D_depositLedger: 'BLOCKED',
  E_bed203B5: 'BLOCKED',
  F_queuesAndResidentView: 'BLOCKED',
};

const result = {
  bookingCode: BOOKING_CODE,
  base: BASE,
  settlementId: null,
  settlementUrl: null,
  amountsFound: {},
  statusBefore: null,
  statusAfter: null,
  completeCheckoutClicked: false,
  loginRequired: false,
  cookieError: null,
  screenshots: {},
  checklist,
  blockers: [],
  pageSnippets: {},
};

function shot(page, name) {
  const file = `${name}.png`;
  return page.screenshot({ path: join(OUT, file), fullPage: true }).then(() => {
    result.screenshots[name] = `public/assets/prod-verify-harish-2026-06-23/${file}`;
  });
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
            'httpOnly': True,
            'secure': bool(c.secure),
            'sameSite': 'Lax',
        })
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(raw.trim());
}

function extractAmounts(text) {
  const pick = (label) => {
    const re = new RegExp(`${label}[\\s\\S]{0,120}?₹\\s*([\\d,]+(?:\\.\\d+)?)`, 'i');
    return text.match(re)?.[1]?.replace(/,/g, '') ?? null;
  };
  return {
    deposit: pick('deposit|held|required'),
    notice: pick('notice'),
    electricity: pick('electricity'),
    refund: pick('refund'),
  };
}

function hasAllExpected(amounts) {
  return (
    amounts.deposit === '1500' &&
    amounts.notice === '595' &&
    amounts.electricity === '905' &&
    (amounts.refund === '0' || amounts.refund === '0.00')
  );
}

async function findSettlementLink(page) {
  const row = page.locator('tr').filter({ hasText: BOOKING_CODE }).first();
  if (await row.count()) {
    const open = row.getByRole('link', { name: /^open$/i });
    if (await open.count()) return open;
  }

  const harishRow = page.locator('tr').filter({ hasText: /harish/i }).first();
  if (await harishRow.count()) {
    const open = harishRow.getByRole('link', { name: /^open$/i });
    if (await open.count()) return open;
  }

  return null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    const cookies = loadChromeAdminCookies();
    if (!cookies.some((c) => c.name === 'apg_admin_session')) {
      throw new Error('apg_admin_session cookie not found');
    }
    await context.addCookies(cookies);
  } catch (err) {
    result.cookieError = err instanceof Error ? err.message : String(err);
    result.blockers.push('No admin session cookie in Chrome Profile 6');
  }

  const page = await context.newPage();

  await page.goto(`${BASE}/admin/checkout-settlements`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);

  if (page.url().includes('/admin/login')) {
    result.loginRequired = true;
    result.blockers.push('Admin login required — no credentials in env');
    checklist.A_adminSession = 'FAIL';
    await shot(page, '00-login-required');
    writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(2);
  }

  checklist.A_adminSession = 'PASS';
  await shot(page, '01-checkout-settlements-list');

  let settlementLink = await findSettlementLink(page);
  const tabs = ['awaiting_resident', 'awaiting_review', 'refund_pending', 'completed'];

  for (const tab of tabs) {
    if (settlementLink) break;
    await page.goto(`${BASE}/admin/checkout-settlements?tab=${tab}`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
    settlementLink = await findSettlementLink(page);
  }

  if (!settlementLink) {
    await page.goto(`${BASE}/admin/residents?q=harish`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    await shot(page, '02-residents-search-harish');
    const profileLink = page.locator('a[href*="/admin/residents/"]').filter({ hasText: /harish/i }).first();
    if (await profileLink.count()) {
      await profileLink.click();
      await page.waitForTimeout(2000);
      const csLink = page.locator('a[href*="/admin/checkout-settlements/"]').first();
      if (await csLink.count()) settlementLink = csLink;
    }
  }

  if (!settlementLink) {
    result.blockers.push(`Could not find settlement for ${BOOKING_CODE} in admin UI`);
    checklist.B_settlementAmounts = 'FAIL';
    writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(1);
  }

  const href = await settlementLink.getAttribute('href');
  result.settlementUrl = href;
  result.settlementId = href?.split('/').pop() ?? null;

  await settlementLink.click();
  await page.waitForTimeout(3000);
  await shot(page, '03-settlement-detail-before');

  const bodyText = await page.locator('body').innerText();
  result.pageSnippets.settlementDetail = bodyText.slice(0, 4000);
  result.amountsFound = extractAmounts(bodyText);
  result.statusBefore = bodyText.match(/Status[\s\S]{0,40}?([a-z_]+)/i)?.[1] ?? null;

  checklist.B_settlementAmounts = hasAllExpected(result.amountsFound) ? 'PASS' : 'FAIL';

  const completeBtn = page.getByRole('button', { name: /complete checkout/i });
  const alreadyCompleted =
    /completed|done/i.test(bodyText) &&
    !/waiting on resident|awaiting resident|awaiting_resident/i.test(bodyText);

  if (alreadyCompleted) {
    checklist.C_completeCheckout = 'PASS';
    result.statusAfter = 'completed';
  } else if (await completeBtn.isVisible().catch(() => false)) {
    await completeBtn.click();
    await page.waitForTimeout(4000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
    result.completeCheckoutClicked = true;
    const afterText = await page.locator('body').innerText();
    result.statusAfter = afterText.match(/completed|done/i)?.[0] ?? result.statusBefore;
    result.pageSnippets.afterComplete = afterText.slice(0, 2000);
    await shot(page, '04-settlement-detail-after-complete');

    const noUpi =
      !/upi|waiting on resident|awaiting resident details/i.test(afterText) ||
      /no refund due|refund ₹0|refund 0/i.test(afterText);
    checklist.C_completeCheckout =
      /completed|done/i.test(afterText) && noUpi ? 'PASS' : 'FAIL';
  } else {
    checklist.C_completeCheckout = alreadyCompleted ? 'PASS' : 'BLOCKED';
    result.blockers.push('Complete checkout button not visible and status not completed');
    await shot(page, '04-settlement-not-actionable');
  }

  if (result.settlementId) {
    const bookingIdMatch = bodyText.match(/booking[\s\S]{0,80}?([0-9a-f-]{36})/i);
    const depositsUrl = bookingIdMatch
      ? `${BASE}/admin/deposits/${bookingIdMatch[1]}`
      : `${BASE}/admin/deposits?q=${BOOKING_CODE}`;

    await page.goto(depositsUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
    const depText = await page.locator('body').innerText();
    result.pageSnippets.deposits = depText.slice(0, 3000);
    await shot(page, '05-deposits-ledger');

    const hasDeductions =
      /deducted|notice|electricity|595|905/i.test(depText) &&
      (/net wallet balance[\s\S]{0,40}?₹\s*0/i.test(depText) || /balance[\s\S]{0,40}?₹\s*0/i.test(depText));
    checklist.D_depositLedger = hasDeductions ? 'PASS' : 'FAIL';
  }

  await page.goto(`${BASE}/admin/beds`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  const bedsText = await page.locator('body').innerText();
  result.pageSnippets.beds = bedsText.slice(0, 2000);
  await shot(page, '06-bed-map');

  const bedAvailable =
    (/203[\s\S]{0,80}?B5[\s\S]{0,80}?(available|vacant|open)/i.test(bedsText) ||
      /B5[\s\S]{0,80}?203[\s\S]{0,80}?(available|vacant|open)/i.test(bedsText)) &&
    !/203[\s\S]{0,80}?B5[\s\S]{0,80}?(occupied|held|reserved)/i.test(bedsText);
  checklist.E_bed203B5 = bedAvailable ? 'PASS' : 'FAIL';

  await page.goto(`${BASE}/admin/checkout-settlements?tab=awaiting_resident`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const awaitingText = await page.locator('body').innerText();
  const harishInAwaiting = /harish|APG-2026-0016/i.test(awaitingText);
  await shot(page, '07-awaiting-resident-queue');

  await page.goto(`${BASE}/admin/checkout-settlements?tab=refund_pending`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const refundText = await page.locator('body').innerText();
  const harishInRefund = /harish|APG-2026-0016/i.test(refundText);
  await shot(page, '08-refund-pending-queue');

  await page.goto(`${BASE}/admin/vacating`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const vacatingText = await page.locator('body').innerText();
  const harishInVacating = /harish|203|B5/i.test(vacatingText);
  await shot(page, '09-vacating-queue');

  checklist.F_queuesAndResidentView =
    !harishInAwaiting && !harishInRefund && !harishInVacating ? 'PASS' : 'FAIL';

  try {
    const visitorCookies = loadChromeAdminCookies().filter((c) => c.name === 'apg_visitor_session');
    if (visitorCookies.length) {
      await context.clearCookies();
      await context.addCookies(visitorCookies);
      await page.goto(`${BASE}/resident`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      await shot(page, '10-resident-view');
      result.pageSnippets.residentView = (await page.locator('body').innerText()).slice(0, 2000);
    }
  } catch {
    result.blockers.push('Resident view screenshot skipped — no visitor session cookie');
  }

  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  const allPass = Object.values(checklist).every((v) => v === 'PASS');
  process.exit(allPass ? 0 : 1);
}

await main();
