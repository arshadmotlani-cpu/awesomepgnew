import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Staff Performance tenant context', () => {
  it('dashboard page resolves tenant before loading command center', () => {
    const page = read('app/(hair)/fyh/(app)/dashboard/staff-performance/page.tsx');
    assert.match(page, /getTenantContextForPage/);
    assert.match(page, /getStaffPerformanceCommandCenter\([\s\S]*ctx/);
  });

  it('command center service resolves tenant at entry', () => {
    const svc = read('src/hair/services/staffPerformanceDashboard.ts');
    const start = svc.indexOf('export async function getStaffPerformanceCommandCenter');
    const fn = svc.slice(start, start + 1200);
    assert.match(fn, /resolveTenantContextForService\(ctx\)/);
    assert.match(fn, /getSalonSettings\(ctx\)/);
  });

  it('export action resolves tenant and uses dashboard_staff permission', () => {
    const action = read('src/hair/actions/staffPerformanceExport.ts');
    assert.match(action, /getTenantContextForAction/);
    assert.match(action, /page:dashboard_staff/);
    assert.match(action, /getStaffPerformanceCommandCenter\([\s\S]*ctx/);
  });
});
