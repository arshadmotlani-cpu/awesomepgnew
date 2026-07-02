import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@awesomepg.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'dev-admin-pass';

async function loginAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });
}

async function openExpressWithResident(page: Page) {
  await page.goto('/admin/express-booking');
  await expect(page.getByRole('heading', { name: /express booking/i })).toBeVisible();
  const search = page.getByPlaceholder(/name or phone/i);
  await search.fill('Waqar');
  await page
    .getByRole('button')
    .filter({ hasText: 'Waqar Ahmad' })
    .first()
    .click();
  await expect(page.locator('[data-express-booking-preview-panel]')).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Express Booking layout', () => {
  test.setTimeout(120_000);

  test('right preview stays fixed while left form scrolls (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAdmin(page);
    await openExpressWithResident(page);

    const adminScroll = page.locator('.apg-admin-scroll');
    const formScroll = page.locator('[data-express-booking-form-scroll]');
    const previewPanel = page.locator('[data-express-booking-preview-panel]');
    const previewFooter = page.locator('[data-express-booking-preview-footer]');
    const continueBtn = page.getByRole('button', { name: /continue to confirm/i });

    await expect(previewPanel).toBeVisible();
    await expect(continueBtn).toBeVisible();

    const adminOverflowY = await adminScroll.evaluate((el) => getComputedStyle(el).overflowY);
    expect(adminOverflowY).toBe('hidden');

    const panelBoxBefore = await previewPanel.boundingBox();
    const footerBoxBefore = await previewFooter.boundingBox();
    expect(panelBoxBefore).not.toBeNull();
    expect(footerBoxBefore).not.toBeNull();

    await formScroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);

    const panelBoxAfter = await previewPanel.boundingBox();
    const footerBoxAfter = await previewFooter.boundingBox();
    expect(panelBoxAfter).not.toBeNull();
    expect(footerBoxAfter).not.toBeNull();

    expect(Math.abs((panelBoxAfter?.y ?? 0) - (panelBoxBefore?.y ?? 0))).toBeLessThan(2);
    expect(Math.abs((footerBoxAfter?.y ?? 0) - (footerBoxBefore?.y ?? 0))).toBeLessThan(2);

    const viewport = page.viewportSize();
    expect(panelBoxAfter!.y + panelBoxAfter!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);

    const leftBox = await formScroll.boundingBox();
    const rightBox = await previewPanel.boundingBox();
    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();
    expect(rightBox!.x).toBeGreaterThanOrEqual(leftBox!.x + leftBox!.width - 2);
  });

  test('preview body scrolls internally when content is tall', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAdmin(page);
    await openExpressWithResident(page);

    const previewScroll = page.locator('[data-express-booking-preview-scroll]');
    await previewScroll.evaluate((el) => {
      el.innerHTML = `<div style="height:2000px">tall preview</div>`;
    });

    const scrollMetrics = await previewScroll.evaluate((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));

    expect(scrollMetrics.overflowY).toBe('auto');
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

    await previewScroll.evaluate((el) => {
      el.scrollTop = 500;
    });
    await expect(page.getByRole('button', { name: /continue to confirm/i })).toBeVisible();
  });
});
