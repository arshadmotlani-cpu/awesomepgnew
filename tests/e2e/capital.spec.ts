import { test, expect } from '@playwright/test';

test.describe('Capital middleware', () => {
  test('PG host does not serve capital dashboard', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/dashboard', {
      waitUntil: 'commit',
    });
    expect(response?.status()).not.toBe(200);
  });
});

test.describe('Capital host routing', () => {
  test.skip(!process.env.CAPITAL_DEV_HOST, 'Set CAPITAL_DEV_HOST=1 for local Capital E2E');

  test('login page renders on capital dev host', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await expect(page.getByText('Automotive Capital')).toBeVisible();
  });
});
