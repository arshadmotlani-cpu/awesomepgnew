import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('overview page uses compact layout without Owner OS card', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/overview/page.tsx'),
    'utf8',
  );
  assert.doesNotMatch(page, /OwnerSummaryCard/);
  assert.doesNotMatch(page, /mt-10/);
  assert.doesNotMatch(page, /mb-8/);
  assert.match(page, /mt-4/);
  assert.match(page, /BillingCertificationNotice/);
});

test('BillingCertificationNotice hides when actionable count is zero', () => {
  const notice = readFileSync(
    join(process.cwd(), 'src/components/admin/overview/BillingCertificationNotice.tsx'),
    'utf8',
  );
  assert.match(notice, /actionableIssueCount === 0/);
  assert.doesNotMatch(notice, /emerald-500/);
  assert.match(notice, /actionableReviewHref/);
  assert.match(notice, /Review →/);
});

test('BillingCentre certification panel uses actionable headline', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/admin/billing/BillingCycleCertificationPanel.tsx'),
    'utf8',
  );
  assert.match(panel, /actionableStatus/);
  assert.match(panel, /actionableHeadline/);
  assert.match(panel, /actionableFailures/);
});

test('admin layout passes Owner OS flag to top nav', () => {
  const layout = readFileSync(join(process.cwd(), 'app/(admin)/layout.tsx'), 'utf8');
  assert.match(layout, /showOwnerOsLink={lifeOsEnabled}/);
  assert.match(layout, /isPersonalFinanceOsEnabled/);
});
