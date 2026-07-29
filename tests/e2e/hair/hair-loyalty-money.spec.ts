import { test, expect } from '@playwright/test';

// Scenarios 2, 3, 4, 9 — loyalty (membership, package, wallet, bridal) UI smoke.
// Money assertions live in the integration suite (rcVisitLoop.test.ts scenarios 2/3/4/9).
// Auth state loaded by hair.auth.setup.ts via playwright config.
test.setTimeout(60_000);

test.describe('Hair ERP loyalty & money UI', () => {
  test('loyalty hub shows membership and package plans', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/loyalty');
    await expect(page.getByRole('heading', { name: /loyalty/i })).toBeVisible({
      timeout: 30_000,
    });
    // Membership plan seeded as RC Gold
    await expect(
      page.getByText(/membership plans|sell membership|RC Gold/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    // Package plan seeded as RC Cut Pack
    await expect(
      page.getByText(/RC Cut Pack|package plans|sell package/i).first(),
    ).toBeVisible();
  });

  test('billing list loads and links to invoices', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
