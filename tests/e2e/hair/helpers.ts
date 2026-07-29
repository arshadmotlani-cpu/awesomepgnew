import type { Page } from '@playwright/test';

export const HAIR_ADMIN_EMAIL = process.env.HAIR_ADMIN_EMAIL?.trim() || 'admin@fyhair.local';
export const HAIR_ADMIN_PASSWORD =
  process.env.HAIR_ADMIN_PASSWORD?.trim() || 'rc-local-change-me';

/**
 * Login on Hair host (requires HAIR_DEV_HOST=1 or fyhair host).
 * Uses stable, hydration-safe input pattern: waits for both inputs to be
 * enabled, focuses each, types sequentially, then submits and waits for
 * a real authed URL.
 */
export async function hairLogin(page: Page): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (
        /\/(dashboard|customers|appointments|billing|loyalty|settings|staff|services|reports|inventory|products|profile)/.test(
          page.url(),
        )
      ) {
        return;
      }
      const email = page.locator('#email');
      const password = page.locator('#password');
      await email.waitFor({ state: 'visible', timeout: 30_000 });
      await password.waitFor({ state: 'visible', timeout: 30_000 });
      // Belt+braces: click to focus, clear, type. Some hydration flows swallow fill.
      await email.click();
      await email.fill('');
      await email.type(HAIR_ADMIN_EMAIL, { delay: 15 });
      await password.click();
      await password.fill('');
      await password.type(HAIR_ADMIN_PASSWORD, { delay: 15 });
      // Confirm the value made it into the DOM before submitting.
      const emailValue = await email.inputValue();
      if (emailValue !== HAIR_ADMIN_EMAIL) {
        throw new Error(
          `email input did not accept value (got "${emailValue.slice(0, 40)}")`,
        );
      }
      const signIn = page.getByRole('button', { name: /^sign in$/i });
      await signIn.click();
      await page.waitForURL(
        /\/(dashboard|customers|appointments|billing|loyalty|settings|staff|services|reports|inventory|products|profile)/,
        { timeout: 60_000 },
      );
      return;
    } catch (err) {
      lastErr = err;
      try {
        await page.waitForTimeout(1_500);
      } catch {
        // page/context closed — bail
        break;
      }
    }
  }
  throw lastErr;
}

export async function expectUnauthRedirect(page: Page, path: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/login/, { timeout: 20_000 });
}
