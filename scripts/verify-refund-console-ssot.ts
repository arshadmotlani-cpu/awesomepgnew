/**
 * Production stabilization audit — Refund Console must be the sole refund workflow in admin UI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';

const ROOT = join(import.meta.dirname, '..');
const ADMIN_UI_DIRS = [
  join(ROOT, 'src', 'components', 'admin'),
  join(ROOT, 'app', '(admin)'),
];

const LEGACY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'checkout-settlements refund tab link', pattern: /checkout-settlements\?tab=refund_pending/ },
  { label: 'mark-refund-paid navigation href', pattern: /href=[^>]*#mark-refund-paid/ },
  { label: 'DepositSettlementPanel usage', pattern: /DepositSettlementPanel/ },
  { label: 'Mark refund paid button label', pattern: /Mark refund paid/ },
  { label: 'Refund / Settlement quick action to checkout', pattern: /Refund \/ Settlement[\s\S]{0,200}checkout-settlements/ },
  { label: 'requests redirect to checkout-settlements', pattern: /Legacy refund queue[\s\S]{0,120}redirect\(`\/admin\/checkout-settlements/ },
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(path, acc);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

function rel(path: string): string {
  return path.slice(ROOT.length + 1);
}

const files = ADMIN_UI_DIRS.flatMap((dir) => walk(dir));
const violations: string[] = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const relative = rel(file);
  const isRefundConsoleCanonical =
    relative.includes('admin/refunds/') ||
    relative.includes('refunds/RefundConsole') ||
    relative.includes('CheckoutSettlementPanel');
  for (const { label, pattern } of LEGACY_PATTERNS) {
    if (!pattern.test(content)) continue;
    if (label === 'Mark refund paid button label' && isRefundConsoleCanonical) continue;
    violations.push(`${relative}: ${label}`);
  }
}

assert.equal(
  violations.length,
  0,
  `Legacy refund workflow references found:\n${violations.join('\n')}`,
);

console.log('✓ Refund Console SSOT audit passed — no legacy refund UI entry points in admin.');
