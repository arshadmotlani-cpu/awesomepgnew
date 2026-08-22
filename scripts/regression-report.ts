#!/usr/bin/env npx tsx
/**
 * Stability Phase — pre-commit regression report.
 *
 *   npm run stability:report
 *   npx tsx scripts/regression-report.ts --ci
 *
 * Exits 0 only when build + scoped tests pass.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

type StepResult = {
  name: string;
  command: string;
  ok: boolean;
  code: number | null;
};

const BILLING_CENTRE_GLOBS = [
  /^src\/components\/admin\/billing\//,
  /^src\/components\/admin\/BillingOverviewPanel/,
  /^src\/services\/billingOperationsDashboard/,
  /^app\/\(admin\)\/admin\/billing\//,
];

const ROOM_OS_GLOBS = [
  /^src\/roomOs\//,
  /^src\/lib\/operations\/roomOsOperationsQueueAdapter/,
  /^src\/lib\/operations\/featureFlag/,
  /^src\/lib\/operations\/supplementaryOperationsQueue/,
  /^app\/api\/cron\/room-os-outbox\//,
];

const BILLING_GLOBS = [
  /^src\/lib\/billing\//,
  /^src\/services\/rentInvoices/,
  /^src\/services\/residentFinancial/,
  /^src\/services\/electricityBilling/,
  /^src\/services\/checkoutSettlement/,
  /^src\/services\/deposits/,
  /^src\/lib\/checkout\//,
  /^src\/lib\/vacating\//,
  /^src\/components\/customer\/account\/resident\//,
  /^src\/lib\/residents\/residentPortalFinancials/,
];

const PG_GLOBS = [
  /^src\//,
  /^tests\/unit\//,
  /^tests\/integration\//,
  /^scripts\//,
  /^app\//,
];

const HAIR_GLOBS = [/^src\/hair\//, /^tests\/hair\//, /^hair\//];
const CAPITAL_GLOBS = [/^src\/capital\//, /^tests\/capital\//, /^capital\//];

function run(cmd: string, args: string[]): StepResult {
  const display = [cmd, ...args].join(' ');
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return {
    name: display,
    command: display,
    ok: (result.status ?? 1) === 0,
    code: result.status,
  };
}

function gitLines(args: string[]): string[] {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

function inferProducts(files: string[]): Set<'pg' | 'hair' | 'capital'> {
  const products = new Set<'pg' | 'hair' | 'capital'>();
  for (const f of files) {
    if (matchesAny(f, HAIR_GLOBS)) products.add('hair');
    if (matchesAny(f, CAPITAL_GLOBS)) products.add('capital');
    if (matchesAny(f, PG_GLOBS) && !matchesAny(f, HAIR_GLOBS) && !matchesAny(f, CAPITAL_GLOBS)) {
      products.add('pg');
    }
  }
  if (products.size === 0) products.add('pg');
  return products;
}

function inferModules(files: string[]): string[] {
  const modules = new Set<string>();
  for (const f of files) {
    if (f.startsWith('src/services/')) modules.add('services');
    if (f.startsWith('src/lib/billing/')) modules.add('billing');
    if (f.startsWith('src/lib/checkout/') || f.includes('checkoutSettlement')) modules.add('checkout/settlement');
    if (f.includes('resident')) modules.add('resident-portal');
    if (matchesAny(f, BILLING_CENTRE_GLOBS)) modules.add('billing-centre');
    if (f.includes('roomIntegrity') || f.includes('roomCapacity')) modules.add('room-inventory');
    if (f.startsWith('src/hair/')) modules.add('hair');
    if (f.startsWith('src/capital/')) modules.add('capital');
    if (f.startsWith('tests/')) modules.add('tests');
    if (f.startsWith('app/')) modules.add('app-routes');
  }
  return [...modules].sort();
}

function possibleRisks(files: string[]): string[] {
  const risks: string[] = [];
  if (files.some((f) => matchesAny(f, BILLING_GLOBS))) {
    risks.push('Billing/resident money — run read-only production audit before deploy.');
  }
  if (files.some((f) => matchesAny(f, ROOM_OS_GLOBS))) {
    risks.push(
      'Room OS Wave 2 — REQUIRED: npm run cert:room-os-wave2 (production) before release; verify outbox cron healthy.',
    );
  }
  if (files.some((f) => matchesAny(f, BILLING_CENTRE_GLOBS) || matchesAny(f, BILLING_GLOBS))) {
    risks.push(
      'Billing Centre / resident portal — REQUIRED: npm run cert:shantinagar-phase1 (production) before release.',
    );
  }
  if (files.some((f) => /schema\/|migrations\//.test(f))) {
    risks.push('Database schema/migration — verify migrate on staging; no destructive prod SQL.');
  }
  if (files.some((f) => f.includes('pgInventory') || f.includes('roomCapacity'))) {
    risks.push('Room inventory — run scripts/audit-room-inventory-readonly.ts after deploy.');
  }
  if (files.some((f) => f.includes('middleware') || f.includes('auth'))) {
    risks.push('Auth/routing — smoke-test login and resident/admin entry points.');
  }
  if (risks.length === 0) risks.push('None flagged by path heuristics — review diff manually.');
  return risks;
}

function changedFiles(ci: boolean): string[] {
  if (ci) {
    const base = gitLines(['rev-parse', '--abbrev-ref', 'origin/main'])[0]
      ? 'origin/main'
      : 'main';
    return [
      ...gitLines(['diff', '--name-only', `${base}...HEAD`]),
      ...gitLines(['diff', '--name-only', '--cached']),
      ...gitLines(['diff', '--name-only']),
    ].filter((v, i, a) => a.indexOf(v) === i);
  }
  return [
    ...gitLines(['diff', '--name-only', 'HEAD']),
    ...gitLines(['diff', '--name-only', '--cached']),
  ].filter((v, i, a) => a.indexOf(v) === i);
}

async function main() {
  const ci = process.argv.includes('--ci');
  const skipBuild = process.argv.includes('--skip-build');

  console.log('═'.repeat(72));
  console.log('STABILITY PHASE — REGRESSION REPORT');
  console.log('═'.repeat(72));
  console.log(`Mode: ${ci ? 'branch vs main' : 'working tree vs HEAD'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const files = changedFiles(ci);

  console.log('── Changed files ──');
  if (files.length === 0) {
    console.log('  (none detected)\n');
  } else {
    for (const f of files) console.log(`  • ${f}`);
    console.log('');
  }

  const products = inferProducts(files);
  const modules = inferModules(files);
  const billingTouched = files.some((f) => matchesAny(f, BILLING_GLOBS));

  console.log('── Affected modules ──');
  for (const m of modules) console.log(`  • ${m}`);
  console.log('');

  console.log('── Products to test ──');
  for (const p of products) console.log(`  • ${p}`);
  console.log('');

  const steps: StepResult[] = [];

  console.log('── Hair money-math SSOT ──');
  const invoiceMathPath = 'src/hair/lib/invoiceMath.ts';
  if (existsSync(invoiceMathPath)) {
    console.log(`  ✗ ${invoiceMathPath} exists — exclusive GST helper must stay deleted.`);
    steps.push({
      name: 'hair money-math: invoiceMath.ts absent',
      command: `test ! -f ${invoiceMathPath}`,
      ok: false,
      code: 1,
    });
  } else {
    console.log('  ✓ exclusive invoiceMath.ts is absent (canonical: gstInclusiveMath + priceBasket)');
    steps.push({
      name: 'hair money-math: invoiceMath.ts absent',
      command: `test ! -f ${invoiceMathPath}`,
      ok: true,
      code: 0,
    });
  }
  console.log('');

  if (!skipBuild && existsSync('package.json')) {
    console.log('── Build ──');
    steps.push(run('npm', ['run', 'build']));
    console.log('');
  }

  console.log('── Unit / integration tests ──');
  if (products.has('pg')) {
    steps.push(run('npm', ['run', 'test:pg']));
  }
  if (products.has('hair')) {
    steps.push(run('npm', ['run', 'test:hair']));
  }
  if (products.has('capital')) {
    steps.push(run('npm', ['run', 'test:capital']));
  }

  if (billingTouched) {
    console.log('\n── Billing settlement suite ──');
    steps.push(run('npm', ['run', 'test:billing-settlement']));
  }

  console.log('\n── Lint guards ──');
  steps.push(run('npm', ['run', 'lint:uploads']));
  steps.push(run('npm', ['run', 'lint:private-blobs']));

  const billingCentreTouched = files.some((f) => matchesAny(f, BILLING_CENTRE_GLOBS));
  const roomOsTouched = files.some((f) => matchesAny(f, ROOM_OS_GLOBS));
  const residentPortalTouched = files.some(
    (f) => f.includes('residentPortal') || f.includes('account/resident'),
  );

  if (
    process.env.DATABASE_URL?.trim() &&
    roomOsTouched &&
    !process.argv.includes('--skip-room-os-cert')
  ) {
    console.log('\n── Room OS Wave 2 certification (read-only) ──');
    steps.push(run('npm', ['run', 'cert:room-os-wave2']));
  } else if (roomOsTouched) {
    console.log(
      '\n── Room OS Wave 2 cert SKIPPED (no DATABASE_URL) ──\n' +
        '  REQUIRED before Room OS release:\n' +
        '  npx vercel env run --environment production npm run cert:room-os-wave2',
    );
  }

  if (
    process.env.DATABASE_URL?.trim() &&
    (billingCentreTouched || residentPortalTouched) &&
    !process.argv.includes('--skip-shantinagar-cert')
  ) {
    console.log('\n── Shantinagar Phase 1 production cert (read-only) ──');
    steps.push(run('npm', ['run', 'cert:shantinagar-phase1']));
  } else if (billingCentreTouched || residentPortalTouched) {
    console.log(
      '\n── Shantinagar Phase 1 cert SKIPPED (no DATABASE_URL) ──\n' +
        '  REQUIRED before Billing Centre release:\n' +
        '  npx vercel env run --environment production npm run cert:shantinagar-phase1',
    );
  }

  console.log('\n═'.repeat(72));
  console.log('SUMMARY');
  console.log('═'.repeat(72));

  console.log('\nTests run:');
  for (const s of steps) {
    console.log(`  ${s.ok ? '✓' : '✗'} ${s.name}`);
  }

  const allOk = steps.every((s) => s.ok);
  console.log(`\nTests passed: ${allOk ? 'YES' : 'NO'}`);

  console.log('\nPossible risks:');
  for (const r of possibleRisks(files)) console.log(`  • ${r}`);

  console.log('\n─'.repeat(72));
  if (!allOk) {
    console.log('STOP — fix failing tests before commit/push.');
    process.exit(1);
  }
  console.log('Green — safe to commit after reviewing risks above.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
