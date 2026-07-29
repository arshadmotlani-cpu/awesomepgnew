import { test, expect } from '@playwright/test';
import { expectUnauthRedirect } from './helpers';

// Scenarios 1, 5, 6, 7, 8 — visit-loop UI smoke.
// Deep money/DB assertions live in tests/hair/integration/rcVisitLoop.test.ts.
// Auth state loaded by hair.auth.setup.ts via playwright config.
test.setTimeout(60_000);

test.describe('Hair ERP visit loop UI', () => {
  test('scenario 17 — unauthenticated users redirected to login', async ({ page }) => {
    await expectUnauthRedirect(page, '/dashboard');
  });

  test('dashboard loads for authed admin', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('appointments calendar loads (scenarios 1/5/6/7/8 UI)', async ({ page }) => {
    await page.goto('/appointments');
    await expect(
      page.getByText(/quick create|appointments|day|calendar/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('customers list reachable', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: /customer/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
