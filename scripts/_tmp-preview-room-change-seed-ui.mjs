/**
 * Seed preview room-change fixtures via admin UI (no local DATABASE_URL).
 * - Scheduled: approved vacating on Syed Ahmed · 203 B4 (+7 days)
 * - Immediate: complete move-out on CV Laxminarayana · 101 B1 (already in queue)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const secrets = JSON.parse(fs.readFileSync('/tmp/preview-room-change-qa-secrets.json', 'utf8'));
const BASE = process.env.PREVIEW_URL ?? 'https://awesomepg-k59k-k7em0zhkg-arshadmotlani-3160s-projects.vercel.app';
const BYPASS = process.env.VERCEL_BYPASS ?? 'uKJd44ewxhisjeWK33nt4wo1TmdcQqnp';
const SHANTINAGAR_PG = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';

function futureDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function adminLogin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('input[type=email]', secrets.ECOSYSTEM_ADMIN_EMAIL);
  await page.fill('input[type=password]', secrets.ECOSYSTEM_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function submitVacatingOnResident(page, customerId, vacatingDate) {
  await page.goto(`${BASE}/admin/residents/${customerId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const mapLink = page.getByRole('link', { name: /bed map|open bed map|view bed/i }).first();
  if (await mapLink.isVisible().catch(() => false)) await mapLink.click();
  else {
    await page.goto(`${BASE}/admin/pgs/${SHANTINAGAR_PG}/map`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
  await page.waitForTimeout(2000);

  // Try bed detail link for 203 / B4 from resident page instead
  await page.goto(`${BASE}/admin/residents/${customerId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);

  const vacatingSection = page.locator('form').filter({ has: page.locator('input[name="vacatingDate"]') }).first();
  if (!(await vacatingSection.isVisible().catch(() => false))) {
    // Open operations / vacating on profile
    const op = page.getByRole('link', { name: /move-out|vacating|checkout/i }).first();
    if (await op.isVisible().catch(() => false)) await op.click();
    await page.waitForTimeout(1500);
  }

  const dateInput = page.locator('input[name="vacatingDate"]').first();
  if (!(await dateInput.isVisible().catch(() => false))) {
    throw new Error(`Vacating form not found on resident ${customerId}`);
  }
  await dateInput.fill(vacatingDate);
  const notice = page.locator('input[name="noticeGivenDate"]').first();
  if (await notice.isVisible().catch(() => false)) await notice.fill(new Date().toISOString().slice(0, 10));
  await page.locator('input[name="openBedForBooking"]').check().catch(() => {});
  await page.locator('form').filter({ has: dateInput }).getByRole('button', { name: /submit|file|notice|vacating/i }).click();
  await page.waitForTimeout(3000);
}

async function approvePendingVacating(page, bookingCode) {
  await page.goto(`${BASE}/admin/vacating`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const row = page.locator('tr, [data-testid], article, li').filter({ hasText: bookingCode }).first();
  if (await row.isVisible().catch(() => false)) {
    await row.getByRole('button', { name: /approve/i }).click().catch(async () => {
      await row.getByRole('link', { name: /review|open|view/i }).click();
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: /approve/i }).click();
    });
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } });
  const page = await ctx.newPage();

  await adminLogin(page);
  console.log('Admin logged in');

  const scheduledDate = futureDate(7);
  try {
    await submitVacatingOnResident(page, 'bfe8d69f-d296-42f5-9534-21fd4d071987', scheduledDate);
    console.log('Submitted vacating for Syed Ahmed', scheduledDate);
    const approved = await approvePendingVacating(page, 'APG-2026-0090');
    console.log('Approve Syed vacating:', approved ? 'attempted' : 'not found in list');
  } catch (e) {
    console.log('Scheduled fixture:', e.message ?? e);
  }

  // Try to free 101 B1 via checkout settlement for Laxminarayana
  try {
    await page.goto(`${BASE}/admin/residents/bf2758b5-d4bc-4935-b6f2-bd76f55dc7db`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
    const checkout = page.getByRole('link', { name: /checkout|settlement|move-out/i }).first();
    if (await checkout.isVisible().catch(() => false)) {
      await checkout.click();
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: /complete|approve|finalize|mark complete/i }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log('Attempted Laxminarayana checkout completion');
    }
  } catch (e) {
    console.log('Immediate fixture:', e.message ?? e);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
