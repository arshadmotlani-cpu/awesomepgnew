import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const certService = readFileSync(
  join(process.cwd(), 'src/services/shantinagarProductionCertification.ts'),
  'utf8',
);
const certScript = readFileSync(
  join(process.cwd(), 'scripts/run-shantinagar-production-certification.ts'),
  'utf8',
);
const occupancySpec = readFileSync(
  join(process.cwd(), 'src/services/shantinagarOccupancySsotRepair.ts'),
  'utf8',
);

test('production certification service exports summary format fields', () => {
  assert.match(certService, /Residents checked:/);
  assert.match(certService, /READY TO MESSAGE ALL RESIDENTS/);
  assert.match(certService, /NOT READY/);
  assert.match(certService, /runShantinagarProductionCertification/);
  assert.match(certService, /auditBedPricing/);
  assert.match(certService, /getShantinagarOccupancyCertification/);
});

test('certification CLI exists', () => {
  assert.match(certScript, /run-shantinagar-production-certification/);
  assert.match(certScript, /--skip-public/);
});

test('room 202 SSOT excludes Jharia', () => {
  const room202 = occupancySpec.match(
    /roomNumber: '202'[\s\S]*?allowedNamePatterns: \[([^\]]+)\]/,
  );
  assert.ok(room202);
  assert.match(room202![0], /angatra/);
  assert.doesNotMatch(room202![0], /jharia/);
});

test('pricing command center uses versioned writes', () => {
  const pcc = readFileSync(join(process.cwd(), 'src/services/pricingCommandCenter.ts'), 'utf8');
  assert.match(pcc, /writeBedPriceVersion/);
  assert.match(pcc, /revalidatePricingViews/);
});

test('PG listing enriches quoted deposit', () => {
  const pgPage = readFileSync(
    join(process.cwd(), 'app/(customer)/pgs/[pgSlug]/page.tsx'),
    'utf8',
  );
  assert.match(pgPage, /enrichBedsWithQuotedMonthlyDeposit/);
});
