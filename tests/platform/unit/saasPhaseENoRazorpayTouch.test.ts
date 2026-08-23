import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const stripeDir = join(root, 'src/platform/billing/stripe');

function listStripeModuleFiles(): string[] {
  return readdirSync(stripeDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.ts'))
    .map((f) => join(stripeDir, f));
}

const relatedFiles = [
  'app/api/platform/stripe/webhook/route.ts',
  'src/hair/actions/platformBilling.ts',
  'src/hair/actions/subscribe.ts',
];

/** Strip comments so comment rewording cannot make the guard pass/fail. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function codeWithoutComments(relOrAbs: string): string {
  const abs = relOrAbs.startsWith('/') ? relOrAbs : join(root, relOrAbs);
  return stripComments(readFileSync(abs, 'utf8'));
}

test('Phase E Stripe modules use PLATFORM_STRIPE_* and do not import PG Razorpay', () => {
  const files = [...listStripeModuleFiles(), ...relatedFiles.map((r) => join(root, r))];

  for (const abs of files) {
    const code = codeWithoutComments(abs);
    const rel = abs.replace(root + '/', '');

    assert.equal(
      /\bfrom\s+['"][^'"]*razorpay[^'"]*['"]/i.test(code) ||
        /\brequire\s*\(\s*['"][^'"]*razorpay[^'"]*['"]\s*\)/i.test(code) ||
        /@\/src\/lib\/payments\b/.test(code) ||
        /\bsrc\/lib\/payments\b/.test(code),
      false,
      `${rel}: must not import Razorpay or src/lib/payments`,
    );
    assert.equal(
      /\bPAYMENT_PROVIDER\b/.test(code) || /\bRAZORPAY_[A-Z0-9_]+\b/.test(code),
      false,
      `${rel}: must not reference PAYMENT_PROVIDER or RAZORPAY_* env keys`,
    );
  }

  const client = codeWithoutComments(join(stripeDir, 'client.ts'));
  assert.ok(/\bPLATFORM_STRIPE_SECRET_KEY\b/.test(client));
  assert.ok(/\bPLATFORM_STRIPE_WEBHOOK_SECRET\b/.test(client));
  assert.ok(
    /\bfrom\s+['"]stripe['"]/.test(client) ||
      /\bimport\s+Stripe\s+from\s+['"]stripe['"]/.test(client),
  );
});

test('subscribe action is unwired from createCheckoutSession', () => {
  const code = codeWithoutComments(join(root, 'src/hair/actions/subscribe.ts'));
  assert.equal(/\bcreateCheckoutSession\b/.test(code), false);
  assert.equal(/billing\/stripe/.test(code), false);
  assert.ok(/\bsubmitSubscriptionPayment\b/.test(code));
});
