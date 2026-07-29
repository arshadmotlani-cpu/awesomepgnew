import { test, expect } from '@playwright/test';

// Scenario 15 — responsive smoke across desktop, tablet, mobile viewports.
// Auth state loaded by hair.auth.setup.ts via playwright config.
test.setTimeout(60_000);

const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'tablet', width: 820, height: 1180 },
  { label: 'mobile', width: 390, height: 844 },
];

test.describe('Hair ERP responsive RC', () => {
  for (const vp of viewports) {
    test(`${vp.label} — customers and appointments reachable`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/customers');
      await expect(page.getByRole('heading', { name: /customer/i })).toBeVisible({
        timeout: 30_000,
      });
      await page.goto('/appointments');
      // Main-content anchor works across viewports; sidebar nav collapses on mobile.
      await expect(
        page.getByRole('heading', { name: /appointment/i }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });
  }
});
