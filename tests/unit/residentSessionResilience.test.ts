import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('resident session validation resilience', () => {
  it('awaits impersonation probe so DB failures cannot null sessions', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
    assert.match(src, /return await isImpersonationCustomerSession\(sessionId\)/);
    assert.match(src, /impersonation session probe failed/);
    assert.match(src, /customer cookie clear skipped/);
  });

  it('login bootstrap does not mutate cookies in RSC', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/auth/loginBootstrap.ts'), 'utf8');
    assert.doesNotMatch(src, /clearSignup|cookies\(\)|jar\./);
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');
    assert.match(mw, /SIGNUP_SESSION_COOKIE/);
    assert.match(mw, /apg_signup_verified/);
  });

  it('retries session cookie lookup before rejecting a missing row', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
    assert.match(src, /lookupSessionRow/);
    assert.match(src, /setTimeout\(resolve, 75\)/);
    assert.match(src, /Never clear the cookie on transient DB errors/);
  });

  it('login page redirects authenticated residents away from the form', () => {
    const src = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    assert.match(src, /getCustomerSession/);
    assert.match(src, /redirect\(safeNext/);
  });

  it('password login confirms session cookie before redirect', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/auth/CustomerLoginForm.tsx'),
      'utf8',
    );
    assert.match(src, /\/api\/auth\/customer\/session\/refresh/);
    assert.match(src, /session cookie was blocked or not saved/);
  });

  it('login form blocks native GET submit before hydration', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/auth/CustomerLoginForm.tsx'),
      'utf8',
    );
    assert.match(src, /method=\"post\"/);
    assert.match(src, /action=\"\/login\"/);
    assert.match(src, /clientReady/);
    assert.match(src, /disabled=\{pending \|\| !clientReady\}/);
  });
});
