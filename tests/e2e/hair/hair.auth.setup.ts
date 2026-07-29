import { test as setup, expect } from '@playwright/test';
import { hairLogin } from './helpers';

/**
 * Playwright setup project — logs in once and persists storage state so every
 * hair spec starts already authenticated. Avoids cold-start 60s login per test
 * against the dev server.
 */
export const HAIR_STORAGE_STATE = 'test-results/.auth/hair-user.json';

setup('authenticate hair admin once', async ({ page }) => {
  setup.setTimeout(120_000);
  await hairLogin(page);
  // Confirm we can reach a real authed page before saving state.
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.context().storageState({ path: HAIR_STORAGE_STATE });
});
