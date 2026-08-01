import { test, expect, type Page } from '@playwright/test';

/**
 * Invoice Register UX QA — production-like checks at 1440px desktop.
 * Mirrors the manual checklist before commit/deploy.
 */
test.describe('Invoice Register QA', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  async function gotoRegister(page: Page) {
    await page.goto('/billing/invoices');
    await expect(page.getByRole('heading', { name: /invoice register/i })).toBeVisible({
      timeout: 30_000,
    });
  }

  test('sidebar — narrower, readable, icons aligned, nothing clipped', async ({ page }) => {
    await gotoRegister(page);
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    // w-48 = 192px (±8px for borders)
    expect(box!.width).toBeGreaterThanOrEqual(184);
    expect(box!.width).toBeLessThanOrEqual(200);

    const navLinks = sidebar.locator('.fyh-nav-link');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 6); i++) {
      const link = navLinks.nth(i);
      await expect(link).toBeVisible();
      const icon = link.locator('svg').first();
      await expect(icon).toBeVisible();
      const linkBox = await link.boundingBox();
      const iconBox = await icon.boundingBox();
      expect(linkBox).not.toBeNull();
      expect(iconBox).not.toBeNull();
      expect(iconBox!.x).toBeGreaterThanOrEqual(linkBox!.x);
      expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(linkBox!.x + linkBox!.width + 1);
    }

    const brand = sidebar.locator('p.fyh-display').first();
    await expect(brand).toBeVisible();
    const brandBox = await brand.boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  });

  async function typeRegisterSearch(page: Page, text: string) {
    const input = page.getByLabel(/search invoices in register/i);
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 25 });
    await page.waitForTimeout(350);
  }

  test('global search — single box, register filter mode, restore on leave', async ({ page }) => {
    await gotoRegister(page);
    const searches = page.getByRole('textbox', { name: /search/i });
    await expect(searches).toHaveCount(1);

    const registerSearch = page.getByLabel(/search invoices in register/i);
    await expect(registerSearch).toBeVisible();
    await typeRegisterSearch(page, 'test');
    await expect(page).toHaveURL(/[?&]q=test/, { timeout: 20_000 });
    await expect(page.locator('.fyh-glass').filter({ has: page.getByRole('link') })).toHaveCount(0);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const dashSearch = page.getByLabel(/search customers and appointments/i);
    await expect(dashSearch).toBeVisible({ timeout: 20_000 });
    await dashSearch.fill('ab');
    await page.waitForTimeout(500);
    // Quick-search dropdown may appear after server action; register mode must not leak
    await expect(page.getByLabel(/search invoices in register/i)).toHaveCount(0);
  });

  test('filters — auto-apply and back/forward restore URL', async ({ page }) => {
    await gotoRegister(page);

    await page.getByLabel(/^from date$/i).click();
    await page.getByRole('dialog', { name: /choose date/i }).locator('button', { hasText: /^15$/ }).first().click();
    await expect(page).toHaveURL(/from=/, { timeout: 10_000 });

    await page.getByLabel(/^to date$/i).click();
    await page.getByRole('dialog', { name: /choose date/i }).locator('button', { hasText: /^20$/ }).first().click();
    await expect(page).toHaveURL(/to=/, { timeout: 10_000 });

    await page.locator('#paymentMode').selectOption('cash');
    await expect(page).toHaveURL(/paymentMode=cash/, { timeout: 15_000 });

    await page.locator('#status').selectOption({ label: 'Paid' });
    await expect(page).toHaveURL(/status=paid/, { timeout: 10_000 });

    const filteredUrl = page.url();
    await page.goto('/dashboard');
    await page.goBack();
    await expect(page).toHaveURL(filteredUrl, { timeout: 15_000 });
    await expect(page.locator('#status')).toHaveValue('paid');
  });

  test('date picker — dark theme, keyboard, month, year, escape, outside click', async ({ page }) => {
    await gotoRegister(page);
    const trigger = page.getByLabel(/^from date$/i);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: /choose date/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/fyh-glass/);

    await page.getByLabel(/previous month/i).click();
    await page.getByLabel(/next month/i).click();
    const yearSelect = page.getByLabel(/^year$/i);
    await expect(yearSelect).toBeVisible();
    const yearOptions = await yearSelect.locator('option').count();
    expect(yearOptions).toBeGreaterThan(5);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(page).toHaveURL(/from=/, { timeout: 10_000 });

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.locator('main h1').click({ position: { x: 10, y: 10 } });
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('table — no horizontal scroll, sticky regions, columns, badges', async ({ page }) => {
    await gotoRegister(page);
    const tableWrap = page.locator('.fyh-table-compact').locator('..');
    await expect(tableWrap).toBeVisible({ timeout: 15_000 });

    const hasHorizontalScroll = await tableWrap.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(hasHorizontalScroll).toBe(false);

    const table = page.locator('table.fyh-table-compact');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th', { hasText: 'Customer' })).toBeVisible();
    await expect(table.locator('thead th', { hasText: 'Mobile' })).toHaveCount(0);
    await expect(table.locator('thead th', { hasText: 'Paid' })).toHaveCount(0);

    const filterBar = page.locator('.sticky.top-0').filter({ has: page.locator('#paymentMode') });
    const thead = table.locator('thead');
    const filterBoxBefore = await filterBar.boundingBox();
    await tableWrap.evaluate((el) => {
      el.scrollTop = 200;
    });
    const filterBoxAfter = await filterBar.boundingBox();
    expect(filterBoxBefore!.y).toBeCloseTo(filterBoxAfter!.y, 0);

    const firstRow = table.locator('tbody tr').first();
    if (await firstRow.count()) {
      await expect(firstRow.locator('td').nth(2)).toBeVisible();
      const statusBadge = firstRow.locator('span.uppercase').first();
      if (await statusBadge.count()) {
        await expect(statusBadge).toBeVisible();
      }
    }

    const rowsSelect = page.locator('#pageSize');
    await expect(rowsSelect).toBeVisible();
  });

  test('functionality — pagination, invoice preview, actions menu, exports present', async ({
    page,
  }) => {
    await gotoRegister(page);

    const table = page.locator('table.fyh-table-compact');
    const rowCount = await table.locator('tbody tr').count();
    if (rowCount > 0) {
      const firstRow = table.locator('tbody tr').first();
      const invoiceBtn = firstRow.locator('button.text-fyh-accent').first();
      await invoiceBtn.click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });

      await firstRow.getByLabel(/invoice actions/i).click();
      await expect(page.getByRole('button', { name: /^view$/i })).toBeVisible({
        timeout: 5_000,
      });
      await page.keyboard.press('Escape');
      await expect(page.getByLabel(/close menu/i)).toHaveCount(0, { timeout: 5_000 });
    }

    await expect(page.getByRole('button', { name: /^excel$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^csv$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pdf register/i })).toBeVisible();

    const nextLink = page.getByRole('link', { name: /next/i });
    if (await nextLink.isVisible().catch(() => false)) {
      const enabled = await nextLink.evaluate((el) => !el.classList.contains('pointer-events-none'));
      if (enabled) {
        await Promise.all([
          page.waitForURL(/[?&]page=2/, { timeout: 20_000 }),
          nextLink.click(),
        ]);
      }
    }
  });

  test('performance — search feels instant, no full reload', async ({ page }) => {
    await gotoRegister(page);
    let fullNavigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) fullNavigations += 1;
    });

    const initialNavs = fullNavigations;
    await typeRegisterSearch(page, 'qa');
    await expect(page).toHaveURL(/[?&]q=qa/, { timeout: 15_000 });
    expect(fullNavigations - initialNavs).toBeLessThanOrEqual(2);

    const layoutShift = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.getBoundingClientRect().top : 0;
    });
    await typeRegisterSearch(page, 'qab');
    await expect(page).toHaveURL(/[?&]q=qab/, { timeout: 15_000 });
    const layoutShiftAfter = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.getBoundingClientRect().top : 0;
    });
    expect(Math.abs(layoutShift - layoutShiftAfter)).toBeLessThan(5);
  });
});
