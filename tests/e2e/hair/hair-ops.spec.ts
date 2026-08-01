import { test, expect } from '@playwright/test';

// Scenarios 10–14, 17–19 — inventory, commission, dashboard, reports, search,
// permissions, settings/timezone, notifications (UI-visible portions).
// Business-logic assertions are in the integration suite.
// Auth state loaded by hair.auth.setup.ts via playwright config.
test.setTimeout(60_000);

test.describe('Hair ERP ops UI', () => {
  test('scenario 18 — settings shows timezone field', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings');
    await expect(page.getByLabel(/timezone/i)).toBeVisible({ timeout: 30_000 });
  });

  test('scenario 12 — dashboard renders KPIs and lists', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('scenario 14 — global search visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible({ timeout: 20_000 });
  });

  test('scenario 15 — global search visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible({ timeout: 20_000 });
  });

  test('invoice register — global search filters via URL without dropdown', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/billing/invoices');
    await expect(page.getByRole('heading', { name: /invoice register/i })).toBeVisible({
      timeout: 30_000,
    });
    const search = page.getByLabel(/search invoices in register/i);
    await expect(search).toBeVisible({ timeout: 20_000 });
    await expect(search).toHaveAttribute(
      'placeholder',
      'Search invoice #, customer, mobile…',
    );
    await search.fill('FYH');
    await expect(page).toHaveURL(/[?&]q=FYH/, { timeout: 10_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('staff module reachable', async ({ page }) => {
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: /staff/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('services module reachable', async ({ page }) => {
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: /service/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('reports module reachable', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /report/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
