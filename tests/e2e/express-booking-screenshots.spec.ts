import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@awesomepg.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'dev-admin-pass';
const SCREENSHOT_DIR = path.join(process.cwd(), 'public/assets/express-booking-e2e');

async function loginAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });
}

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function runFlow(page: Page, prefix: string) {
  await loginAdmin(page);
  await page.goto('/admin/express-booking');
  await expect(page.getByRole('heading', { name: /express booking/i })).toBeVisible();

  const search = page.getByPlaceholder(/name or phone/i);
  await search.fill('W');
  await expect(page.getByText('Waqar Ahmad')).toBeVisible({ timeout: 15_000 });
  await snap(page, `${prefix}-01-live-search`);

  await page.getByRole('button').filter({ hasText: 'Waqar Ahmad' }).first().click();
  await expect(page.locator('dt:text("PG") + dd')).toHaveText('Shantinagar - Awesome PG', {
    timeout: 15_000,
  });
  await snap(page, `${prefix}-02-waqar-active-tenancy`);

  await page.getByRole('button', { name: /fixed stay/i }).click();
  await page.locator('input[type="date"]').first().fill('2026-06-10');
  await page.locator('input[type="date"]').nth(1).fill('2026-06-15');
  await expect(page.getByText(/historical check-in/i)).toBeVisible({ timeout: 15_000 });
  await snap(page, `${prefix}-03-historical-fixed-stay`);

  await page.getByRole('button', { name: /monthly stay/i }).click();
  await page.locator('input[type="date"]').first().fill('2026-06-01');
  await expect(page.getByText(/historical check-in/i)).toBeVisible({ timeout: 15_000 });
  await snap(page, `${prefix}-04-monthly-stay`);

  await page.getByRole('button', { name: /paid in full/i }).click();
  await snap(page, `${prefix}-05-paid-invoice`);

  await page.getByRole('button', { name: /generate due bill/i }).click();
  await snap(page, `${prefix}-06-due-invoice`);
}

test.describe('Express Booking screenshots', () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('desktop flow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await runFlow(page, 'desktop');
  });

  test('mobile flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await runFlow(page, 'mobile');
  });
});
