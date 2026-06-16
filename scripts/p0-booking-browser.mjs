/**
 * P0 browser evidence — headless Playwright screenshots at iPhone/Android widths.
 * Run: npx playwright install chromium && node scripts/p0-booking-browser.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.P0_BASE_URL ?? 'http://localhost:3000';
const OUT = join(process.cwd(), 'artifacts/p0-booking');
const PG_SLUG = process.env.P0_PG_SLUG ?? 'central-awesome-pg';

mkdirSync(OUT, { recursive: true });

async function tryOpenBookingPanel(page) {
  await page.goto(`${BASE}/pgs/${PG_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1500);

  const roomLink = page.locator('a[href*="/rooms/"]').first();
  if (await roomLink.count()) {
    await roomLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
  }

  const bookMarkers = [
    'button:has-text("Book this bed")',
    'button:has-text("Book")',
    '[data-focus="bed-pick"]',
    'button:has-text("Select bed")',
  ];
  for (const sel of bookMarkers) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click();
      await page.waitForTimeout(1000);
      break;
    }
  }
}

async function runViewport(name, viewport, isMobile) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices[isMobile ? 'iPhone 13' : 'Pixel 7'],
    viewport,
    recordVideo: { dir: OUT, size: viewport },
  });
  const page = await context.newPage();
  const results = { name, steps: [] };

  try {
    await tryOpenBookingPanel(page);
    await page.screenshot({ path: join(OUT, `${name}-01-panel.png`), fullPage: true });
    results.steps.push('panel_open');

    const stayBtn = page.getByRole('button', { name: /select stay dates|stay dates/i });
    if (await stayBtn.count()) {
      await stayBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${name}-02-picker-open.png`), fullPage: true });
      results.steps.push('picker_open');

      const fixed = page.getByLabel(/fixed stay/i);
      if (await fixed.count()) await fixed.check();

      const dialog = page.getByRole('dialog', { name: /choose stay dates/i });
      const enabledDays = dialog.locator('button[aria-label]:not([disabled])');
      const count = await enabledDays.count();
      results.enabled_day_count = count;

      if (count >= 2) {
        const labels = [];
        for (let i = 0; i < Math.min(count, 30); i++) {
          labels.push(await enabledDays.nth(i).getAttribute('aria-label'));
        }
        results.sample_labels = labels.filter(Boolean).slice(0, 8);

        const checkInLabel = labels.find((l) => l && l >= '2026-06-20') ?? labels[0];
        const checkInBtn = dialog.locator(`button[aria-label="${checkInLabel}"]`);
        await checkInBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, `${name}-03-checkin.png`), fullPage: true });
        results.steps.push(`checkin_picked:${checkInLabel}`);

        const later = labels.filter((l) => l && checkInLabel && l > checkInLabel);
        const checkOutLabel = later[2] ?? later[0];
        if (checkOutLabel) {
          await dialog.locator(`button[aria-label="${checkOutLabel}"]`).click();
          await page.waitForTimeout(500);
          const modalVisible = await dialog.isVisible().catch(() => false);
          results.steps.push(`checkout_picked:${checkOutLabel} modal_closed=${!modalVisible}`);
          const triggerText = await stayBtn.innerText();
          results.trigger_after = triggerText.replace(/\s+/g, ' ').trim();
          await page.screenshot({ path: join(OUT, `${name}-04-complete.png`), fullPage: true });
        }
      }

      const doneBtn = page.getByRole('button', { name: /^done$/i });
      results.steps.push(`done_button_visible=${await doneBtn.isVisible().catch(() => false)}`);
    } else {
      results.steps.push('stay_dates_button_not_found');
    }
  } catch (e) {
    results.error = String(e);
  }

  await page.close();
  await context.close();
  await browser.close();
  return results;
}

const desktop = await runViewport('desktop', { width: 1280, height: 800 }, false);
const iphone = await runViewport('iphone', { width: 390, height: 844 }, true);
const android = await runViewport('android', { width: 412, height: 915 }, true);

console.log(JSON.stringify({ desktop, iphone, android, outDir: OUT }, null, 2));
