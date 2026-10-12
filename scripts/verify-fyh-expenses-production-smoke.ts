/* eslint-disable no-console */
/**
 * Production FYH /expenses smoke (Playwright). Requires:
 *   ECOSYSTEM_ADMIN_PASSWORD or HAIR_ADMIN_PASSWORD
 *   BASE_URL=https://fyhair.awesomepg.in (default)
 */
import { chromium } from 'playwright';
import { ECOSYSTEM_ADMIN_EMAIL } from '@/src/lib/auth/ecosystemAdmin';

const baseURL = (process.env.BASE_URL || 'https://fyhair.awesomepg.in').replace(/\/$/, '');
const email =
  process.env.HAIR_ADMIN_EMAIL?.trim().toLowerCase() ||
  process.env.ECOSYSTEM_ADMIN_EMAIL?.trim().toLowerCase() ||
  ECOSYSTEM_ADMIN_EMAIL;
const password =
  process.env.HAIR_ADMIN_PASSWORD?.trim() || process.env.ECOSYSTEM_ADMIN_PASSWORD?.trim() || '';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  if (!password) {
    console.error('Missing ECOSYSTEM_ADMIN_PASSWORD or HAIR_ADMIN_PASSWORD — cannot run authenticated prod smoke.');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/(dashboard|expenses|customers)/, { timeout: 60_000 });
    record('login', true);

    await page.goto('/expenses', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const onLogin = /login/.test(page.url());
    record('/expenses loads for authorized user', !onLogin, onLogin ? `redirected to ${page.url()}` : undefined);

    if (!onLogin) {
      const heading = await page.getByRole('heading', { name: /general expenses/i }).isVisible().catch(() => false);
      record('General expenses heading visible', heading);
      const addBtn = await page.getByRole('button', { name: /add expense/i }).isVisible().catch(() => false);
      record('Add expense button visible (implies general.add)', addBtn);
      const total = await page.getByText(/Total \(filtered\)/i).isVisible().catch(() => false);
      record('Filtered totals visible', total);
      const filters = await page.getByRole('button', { name: /apply filters/i }).isVisible().catch(() => false);
      record('Filters form visible', filters);

      if (addBtn) {
        await page.getByRole('button', { name: /add expense/i }).click();
        const modal = await page.getByRole('heading', { name: /new expense/i }).isVisible().catch(() => false);
        record('Add expense modal opens', modal);
        const paidBy = page.locator('#paidBy');
        if (await paidBy.isVisible().catch(() => false)) {
          await paidBy.selectOption('staff');
          const staffSelect = await page.locator('#staffEmployeeId').isVisible().catch(() => false);
          record('Paid by Staff shows staff name field', staffSelect);
          await paidBy.selectOption('salon');
          const hidden = !(await page.locator('#staffEmployeeId').isVisible().catch(() => true));
          record('Paid by Salon hides staff name', hidden);
          await paidBy.selectOption('owner');
          const hidden2 = !(await page.locator('#staffEmployeeId').isVisible().catch(() => true));
          record('Paid by Owner hides staff name', hidden2);
        }
        await page.getByRole('button', { name: /^close$/i }).first().click().catch(() => {});
      }
    }

    await context.clearCookies();
    await page.goto('/expenses', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/login/, { timeout: 20_000 });
    record('Unauthorized user redirected from /expenses', true);
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} production smoke checks passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
