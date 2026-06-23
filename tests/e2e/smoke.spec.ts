import { test, expect } from '@playwright/test';

const hasBaseUrl = Boolean(process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL);

test.describe('smoke', () => {
  test.skip(!hasBaseUrl && !process.env.CI, 'Set BASE_URL or run in CI with webServer');

  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/awesome|pg/i);
  });

  test('PG browse page responds', async ({ page }) => {
    await page.goto('/pgs');
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
