import { test, expect, type Page } from '@playwright/test';
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

async function openExpressBooking(page: Page) {
  await page.goto('/admin/express-booking');
  await expect(page.getByRole('heading', { name: /express booking/i })).toBeVisible();
}

async function selectWaqar(page: Page) {
  const search = page.getByPlaceholder(/name or phone/i);
  await search.fill('W');
  await expect(page.getByText('Waqar Ahmad')).toBeVisible({ timeout: 15_000 });
  await search.fill('Waqar');
  await page.getByRole('button').filter({ hasText: 'Waqar Ahmad' }).first().click();
  await expect(page.locator('dt:text("PG") + dd')).toHaveText('Shantinagar - Awesome PG', {
    timeout: 15_000,
  });
  await expect(page.locator('dt:text("Room · Bed") + dd')).toHaveText('203 · B3');
}

function attachConsoleGuard(page: Page, errors: string[]) {
  page.on('pageerror', (err) => errors.push(err.message));
}

test.describe('Express Booking E2E', () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('live search, active tenancy, stay flows, payment modes', async ({ page }) => {
    const clientErrors: string[] = [];
    attachConsoleGuard(page, clientErrors);

    await loginAdmin(page);
    await openExpressBooking(page);

    // Live search — no Search button
    const search = page.getByPlaceholder(/name or phone/i);
    await expect(page.getByRole('button', { name: /^search$/i })).toHaveCount(0);
    await search.fill('W');
    await expect(page.getByText('Waqar Ahmad')).toBeVisible({ timeout: 15_000 });

    await selectWaqar(page);
    await expect(page.getByText('Current assignment')).toBeVisible();
    await expect(page.getByRole('button', { name: /fixed stay/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('dt:text("PG") + dd')).toHaveText('Shantinagar - Awesome PG');
    await expect(page.locator('dt:text("Room · Bed") + dd')).toHaveText('203 · B3');

    expect(clientErrors).toEqual([]);

    // Historical fixed stay
    await page.getByRole('button', { name: /fixed stay/i }).click();
    await page.locator('input[type="date"]').first().fill('2026-06-10');
    await page.locator('input[type="date"]').nth(1).fill('2026-06-15');
    await expect(page.getByText(/historical check-in/i)).toBeVisible({ timeout: 15_000 });

    // Current monthly stay
    await page.getByRole('button', { name: /monthly stay/i }).click();
    await page.locator('input[type="date"]').first().fill('2026-06-01');
    await expect(page.getByText(/historical check-in/i)).toBeVisible({ timeout: 15_000 });

    // Paid invoice mode
    await page.getByRole('button', { name: /paid in full/i }).click();
    await expect(page.getByRole('button', { name: /paid in full/i })).toHaveClass(/FF5A1F|border-\[#FF5A1F\]/);

    // Due invoice mode
    await page.getByRole('button', { name: /generate due bill/i }).click();
    await expect(page.getByRole('button', { name: /generate due bill/i })).toHaveClass(/FF5A1F|border-\[#FF5A1F\]/);

    // Quote should load for historical monthly
    await expect(page.getByText(/₹|INR|rent/i).first()).toBeVisible({ timeout: 20_000 });

    expect(clientErrors).toEqual([]);
  });
});
