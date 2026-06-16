/**
 * P0 visual acceptance — desktop + mobile booking date picker evidence.
 *
 * Prerequisites:
 *   DATABASE_URL=postgres://...@localhost:5432/awesomepg npm run db:migrate && npm run db:seed
 *   SKIP_MIGRATION_CHECK=true DATABASE_URL=... npm run dev
 *
 * Run:
 *   node scripts/p0-booking-visual.mjs
 */
import { chromium, devices } from 'playwright';
import { copyFileSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.P0_BASE_URL ?? 'http://localhost:3000';
const OUT = join(process.cwd(), 'artifacts/p0-booking');
const PG_SLUG = process.env.P0_PG_SLUG ?? 'awesome-pg-koramangala';

mkdirSync(OUT, { recursive: true });

async function dismissOverlays(page) {
  const skipTour = page.getByRole('button', { name: /skip tour/i });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(400);
  }
  const closeCoach = page.getByRole('button', { name: /^✕$|close/i }).first();
  if (await closeCoach.isVisible().catch(() => false)) {
    await closeCoach.click().catch(() => undefined);
  }
}

async function openBookingPanel(page) {
  await page.goto(`${BASE}/pgs/${PG_SLUG}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  const dbError = page.getByText(/couldn't reach the database/i);
  if (await dbError.isVisible().catch(() => false)) {
    throw new Error('Database error on PG page');
  }

  await page.locator('[data-roachie-tour="bed-map"]').waitFor({ state: 'visible', timeout: 30000 });

  const availableBed = page
    .locator('[data-roachie-tour="bed-map"] button')
    .filter({ hasText: /available/i })
    .first();
  await availableBed.waitFor({ state: 'visible', timeout: 20000 });
  await availableBed.click();
  await page.waitForTimeout(800);

  const sheet = page.locator('[data-roachie-tour="bed-detail-sheet"]');
  await sheet.waitFor({ state: 'visible', timeout: 15000 });
  const bookBtn = sheet.getByRole('button', { name: 'Book this bed', exact: true });
  await bookBtn.click();
  await page.waitForTimeout(1000);

  const fixedStay = page.getByText('Fixed stay', { exact: true });
  await fixedStay.click();
  await page.waitForTimeout(400);
}

async function pickDateRange(page) {
  const stayBtn = page.getByRole('button', { name: /select stay dates|stay dates/i });
  await stayBtn.waitFor({ state: 'visible', timeout: 20000 });
  await stayBtn.click();
  await page.waitForTimeout(600);

  const dialog = page.getByRole('dialog', { name: 'Choose stay dates' });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

  const enabledDays = dialog.locator('button[aria-label]:not([disabled])');
  await enabledDays.first().waitFor({ state: 'visible', timeout: 10000 });
  const count = await enabledDays.count();
  const labels = [];
  for (let i = 0; i < Math.min(count, 40); i++) {
    labels.push(await enabledDays.nth(i).getAttribute('aria-label'));
  }
  const valid = labels.filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l));
  if (valid.length < 2) throw new Error(`Not enough selectable days: ${valid.length}`);

  const checkIn = valid[Math.min(5, valid.length - 1)];
  const checkOut =
    valid.find((d) => d > checkIn && valid.indexOf(d) >= valid.indexOf(checkIn) + 3) ??
    valid[valid.length - 1];

  await dialog.locator(`button[aria-label="${checkIn}"]`).click();
  await page.waitForTimeout(500);

  return { dialog, stayBtn, checkIn, checkOut };
}

async function clickCheckout(dialog, checkOut) {
  await dialog.locator(`button[aria-label="${checkOut}"]`).click();
}

async function runFlow({ name, viewport, isMobile, videoName }) {
  const browser = await chromium.launch({ headless: true });
  const videoDir = join(OUT, `_video-${name}`);
  mkdirSync(videoDir, { recursive: true });

  const context = await browser.newContext({
    ...(isMobile ? devices['iPhone 13'] : {}),
    viewport,
    recordVideo: { dir: videoDir, size: viewport },
    locale: 'en-IN',
  });
  const page = await context.newPage();
  const result = { name, ok: false, steps: [], checkIn: null, checkOut: null, error: null };

  try {
    await openBookingPanel(page);
    result.steps.push('panel_open');

    const { dialog, stayBtn, checkIn, checkOut } = await pickDateRange(page);
    result.checkIn = checkIn;
    result.checkOut = checkOut;
    result.steps.push(`checkin:${checkIn}`);

    if (name === 'desktop-capture') {
      await page.screenshot({ path: join(OUT, 'step-after-first-click.png'), fullPage: false });
    }

    await clickCheckout(dialog, checkOut);
    await page.waitForTimeout(700);
    result.steps.push(`checkout:${checkOut}`);

    const modalClosed = !(await dialog.isVisible().catch(() => false));
    result.steps.push(`modal_closed:${modalClosed}`);
    if (!modalClosed) throw new Error('Modal did not close after second click');

    if (name === 'desktop-capture') {
      await page.screenshot({ path: join(OUT, 'step-after-second-click.png'), fullPage: false });
      await page.screenshot({ path: join(OUT, 'step-modal-closed.png'), fullPage: false });
      await page.screenshot({ path: join(OUT, 'booking-summary.png'), fullPage: false });
    }

    const triggerText = (await stayBtn.innerText()).replace(/\s+/g, ' ').trim();
    result.triggerText = triggerText;

    const doneBtn = page.getByRole('button', { name: /^done$/i });
    result.doneVisible = await doneBtn.isVisible().catch(() => false);

    const yourStay = page.getByText(/your stay/i);
    result.summaryVisible = await yourStay.isVisible().catch(() => false);

    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    await page.screenshot({ path: join(OUT, `${name}-error.png`), fullPage: true }).catch(() => undefined);
  }

  await page.close();
  await context.close();
  await browser.close();

  const webms = readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
  if (webms.length && videoName) {
    const src = join(videoDir, webms[0]);
    const dest = join(OUT, videoName);
    try {
      renameSync(src, dest.replace(/\.mp4$/, '.webm'));
      result.video = dest.replace(/\.mp4$/, '.webm');
    } catch {
      copyFileSync(src, join(OUT, `${videoName.replace('.mp4', '')}.webm`));
      result.video = join(OUT, `${videoName.replace('.mp4', '')}.webm`);
    }
  }

  return result;
}

// Initial state before opening picker (desktop)
async function captureBefore() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await openBookingPanel(page);
    const stayBtn = page.getByRole('button', { name: /select stay dates|stay dates/i });
    await stayBtn.waitFor({ state: 'visible', timeout: 20000 });
    await page.screenshot({ path: join(OUT, 'before.png'), fullPage: false });
    await stayBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'picker-open.png'), fullPage: false });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

await captureBefore();

const desktop = await runFlow({
  name: 'desktop-capture',
  viewport: { width: 1280, height: 800 },
  isMobile: false,
  videoName: 'desktop.webm',
});

const mobile = await runFlow({
  name: 'mobile-capture',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  videoName: 'mobile.webm',
});

// after.png = closed modal + updated summary
if (desktop.ok) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await openBookingPanel(page);
    const stayBtn = page.getByRole('button', { name: /select stay dates|stay dates/i });
    await stayBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Choose stay dates' });
    const enabled = dialog.locator('button[aria-label]:not([disabled])');
    const labels = [];
    for (let i = 0; i < Math.min(await enabled.count(), 40); i++) {
      labels.push(await enabled.nth(i).getAttribute('aria-label'));
    }
    const valid = labels.filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l));
    const ci = valid[5] ?? valid[0];
    const co = valid.find((d) => d > ci) ?? valid[valid.length - 1];
    await dialog.locator(`button[aria-label="${ci}"]`).click();
    await page.waitForTimeout(400);
    await dialog.locator(`button[aria-label="${co}"]`).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, 'after.png'), fullPage: false });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

const summary = {
  outDir: OUT,
  desktop,
  mobile,
  artifacts: readdirSync(OUT).map((f) => {
    const p = join(OUT, f);
    return { file: f, bytes: statSync(p).size };
  }),
};

console.log(JSON.stringify(summary, null, 2));
process.exit(desktop.ok && mobile.ok ? 0 : 1);
