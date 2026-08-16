/**
 * Mobile shell visual QA — verifies header geometry at iPhone widths.
 * Run: npx playwright test tests/e2e/mobile-shell-visual.spec.ts
 */
import { test, expect } from '@playwright/test';

const OWNER_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <style>
    :root {
      --oo-safe-top: 47px;
      --oo-safe-bottom: 34px;
      --oo-safe-left: 0px;
      --oo-safe-right: 0px;
      --oo-border: rgba(255,255,255,0.1);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0b0f14; color: #fff; font-family: system-ui, sans-serif; }
    .oo-shell { height: 100dvh; max-width: 100vw; overflow: hidden; display: flex; }
    .oo-app-column {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0; min-height: 0; flex: 1; overflow: hidden;
    }
    .oo-app-header {
      padding-top: var(--oo-safe-top);
      padding-left: max(0.75rem, var(--oo-safe-left));
      padding-right: max(0.75rem, var(--oo-safe-right));
      border-bottom: 1px solid var(--oo-border);
      background: rgba(11, 15, 20, 0.95);
    }
    .oo-app-header-row {
      display: flex; align-items: center; gap: 0.75rem; min-height: 3.5rem;
    }
    .oo-app-header-title { flex: 1; min-width: 0; }
    .menu, .signout {
      min-height: 44px; min-width: 44px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
    }
    main { overflow: auto; padding: 1rem; }
  </style>
</head>
<body>
  <div class="oo-shell">
    <div class="oo-app-column">
      <header class="oo-app-header" data-testid="owner-header">
        <div class="oo-app-header-row">
          <button type="button" class="menu" data-testid="owner-menu">☰</button>
          <div class="oo-app-header-title">
            <p style="font-size:12px;color:#FF5A1F;margin:0">OWNER OS</p>
            <p style="font-size:14px;font-weight:600;margin:0">Owner</p>
          </div>
          <button type="button" class="signout" data-testid="owner-signout">Out</button>
        </div>
      </header>
      <main><p>Dashboard content</p></main>
    </div>
  </div>
</body>
</html>
`;

const CAPITAL_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <style>
    :root {
      --ac-safe-top: 47px;
      --ac-safe-bottom: 34px;
      --ac-safe-left: 0px;
      --ac-safe-right: 0px;
      --ac-border: rgba(255,255,255,0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #08080c; color: #f4f4f5; font-family: system-ui, sans-serif; }
    .ac-capital-shell { height: 100dvh; max-width: 100vw; overflow: hidden; display: flex; }
    .ac-app-column {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0; min-height: 0; flex: 1; overflow: hidden;
    }
    .ac-app-header {
      padding-top: var(--ac-safe-top);
      padding-left: max(0.75rem, var(--ac-safe-left));
      padding-right: max(0.75rem, var(--ac-safe-right));
      border-bottom: 1px solid var(--ac-border);
      background: rgba(15, 15, 20, 0.95);
    }
    .ac-app-header-row {
      display: flex; align-items: center; gap: 0.5rem; min-height: 3.5rem;
    }
    .ac-app-header-title { flex: 1; min-width: 0; }
    .menu, .signout {
      min-height: 44px; min-width: 44px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
    }
    main { overflow: auto; padding: 1rem; }
    .new-vehicle { min-height: 44px; padding: 0 1rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="ac-capital-shell">
    <div class="ac-app-column">
      <header class="ac-app-header" data-testid="capital-header">
        <div class="ac-app-header-row">
          <button type="button" class="menu" data-testid="capital-menu">☰</button>
          <div class="ac-app-header-title">
            <p style="font-size:12px;color:#22d3ee;margin:0">CAPITAL OS</p>
            <p style="font-size:14px;font-weight:600;margin:0">Automotive Capital</p>
          </div>
          <button type="button" class="signout" data-testid="capital-signout">Out</button>
        </div>
      </header>
      <main>
        <button type="button" class="new-vehicle" data-testid="capital-new-vehicle">New Vehicle</button>
        <p>Dashboard content</p>
      </main>
    </div>
  </div>
</body>
</html>
`;

const WIDTHS = [320, 375, 390, 430];

for (const width of WIDTHS) {
  test(`Owner shell at ${width}px — controls below safe-area`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(OWNER_FIXTURE, { waitUntil: 'domcontentloaded' });

    const menu = page.getByTestId('owner-menu');
    const signout = page.getByTestId('owner-signout');
    const menuBox = await menu.boundingBox();
    const signoutBox = await signout.boundingBox();

    expect(menuBox).not.toBeNull();
    expect(signoutBox).not.toBeNull();
    expect(menuBox!.y).toBeGreaterThanOrEqual(47);
    expect(signoutBox!.y).toBeGreaterThanOrEqual(47);
    expect(menuBox!.height).toBeGreaterThanOrEqual(44);
    expect(signoutBox!.height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test(`Capital shell at ${width}px — controls below safe-area`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(CAPITAL_FIXTURE, { waitUntil: 'domcontentloaded' });

    const menu = page.getByTestId('capital-menu');
    const signout = page.getByTestId('capital-signout');
    const newVehicle = page.getByTestId('capital-new-vehicle');
    const menuBox = await menu.boundingBox();
    const signoutBox = await signout.boundingBox();
    const newVehicleBox = await newVehicle.boundingBox();

    expect(menuBox!.y).toBeGreaterThanOrEqual(47);
    expect(signoutBox!.y).toBeGreaterThanOrEqual(47);
    expect(newVehicleBox!.y).toBeGreaterThan(47 + 56);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
