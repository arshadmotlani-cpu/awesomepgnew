import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Revenue dashboard responsive layout', () => {
  it('uses compact DashboardShell and scoped root class', () => {
    const src = read('src/hair/components/dashboard/RevenueDashboard.tsx');
    assert.match(src, /headerDensity="compact"/);
    assert.match(src, /fyh-revenue-dashboard/);
  });

  it('filters use compact mobile grid without full-width card-only layout', () => {
    const src = read('src/hair/components/dashboard/RevenueDashboardFilters.tsx');
    assert.match(src, /grid-cols-2/);
    assert.match(src, /sm:fyh-dashboard-card/);
    assert.doesNotMatch(src, /className="fyh-dashboard-card flex flex-col gap-4 p-4/);
  });

  it('gift card note is inline, not a stacked block subtitle', () => {
    const src = read('src/hair/components/dashboard/RevenueDashboard.tsx');
    assert.match(src, /labelNote/);
    assert.match(src, /Not separately tracked/);
    assert.doesNotMatch(src, /sub=\{sales\.giftCardPaise === 0/);
  });

  it('Actual Collection uses mobile row list before sm grid', () => {
    const src = read('src/hair/components/dashboard/RevenueDashboard.tsx');
    assert.match(src, /sm:hidden/);
    assert.match(src, /hidden gap-3 sm:grid/);
  });

  it('InvoicesDayWiseChart supports compact height', () => {
    const charts = read('src/hair/components/dashboard/RevenueCharts.tsx');
    assert.match(charts, /compact\?: boolean/);
    assert.match(charts, /h-\[168px\] sm:h-\[220px\]/);
    const dash = read('src/hair/components/dashboard/RevenueDashboard.tsx');
    assert.match(dash, /InvoicesDayWiseChart data=\{report\.invoicesDayWise\} compact/);
  });

  it('DashboardShell exposes optional compact header density', () => {
    const shell = read('src/hair/components/dashboard/DashboardShell.tsx');
    assert.match(shell, /headerDensity\?: 'default' \| 'compact'/);
    assert.match(shell, /text-\[1\.75rem\]/);
  });

  it('scoped mobile page gap in globals.css', () => {
    const css = read('src/hair/styles/globals.css');
    assert.match(css, /\.fyh-revenue-dashboard\.fyh-page/);
  });
});
