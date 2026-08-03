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
});
