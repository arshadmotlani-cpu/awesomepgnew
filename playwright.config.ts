import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: baseURL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: baseURL
    ? undefined
    : process.env.CI
      ? {
          // Production server avoids dev-only route conflicts and migration gate.
          command: 'npm run build && npm run start',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 300_000,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            SKIP_MIGRATION_CHECK: 'true',
          },
        }
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
        },
});
