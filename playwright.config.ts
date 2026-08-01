import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
const HAIR_STORAGE_STATE = 'test-results/.auth/hair-user.json';

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
  projects: [
    {
      name: 'hair-setup',
      testMatch: /hair\.auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'hair',
      testMatch: /hair\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: HAIR_STORAGE_STATE,
      },
      dependencies: ['hair-setup'],
    },
    {
      name: 'hair-webkit',
      testMatch: /hair\/hair-invoice-register-qa\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
        storageState: HAIR_STORAGE_STATE,
      },
      dependencies: ['hair-setup'],
    },
    {
      name: 'chromium',
      testIgnore: [/hair\/.*/, /hair\.auth\.setup\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: baseURL
    ? undefined
    : process.env.CI
      ? {
          command: 'npm run build && npm run start',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 300_000,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            SKIP_MIGRATION_CHECK: 'true',
            HAIR_DEV_HOST: '1',
          },
        }
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            ...process.env,
            HAIR_DEV_HOST: '1',
          },
        },
});
