import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  IMPERSONATION_DEFAULT_REASON,
  IMPERSONATION_SESSION_MS,
  impersonationSessionExpiry,
} from '../../src/lib/auth/impersonationPolicy';

test('impersonation session TTL is four hours', () => {
  assert.equal(IMPERSONATION_SESSION_MS, 4 * 60 * 60 * 1000);
  const now = new Date('2026-08-01T12:00:00Z');
  const exp = impersonationSessionExpiry(now);
  assert.equal(exp.getTime() - now.getTime(), IMPERSONATION_SESSION_MS);
});

test('impersonation default reason is UX Review', () => {
  assert.equal(IMPERSONATION_DEFAULT_REASON, 'UX Review');
});

test('isImpersonationCustomerSession never breaks resident session validation', () => {
  const sessionSrc = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
  // Bare `return promise` inside try/catch does not catch rejections — must await.
  assert.match(
    sessionSrc,
    /return await isImpersonationCustomerSession\(sessionId\)/,
  );
  assert.doesNotMatch(
    sessionSrc,
    /return isImpersonationCustomerSession\(sessionId\);/,
  );

  const impersonationSrc = readFileSync(
    join(process.cwd(), 'src/lib/auth/impersonation.ts'),
    'utf8',
  );
  assert.match(impersonationSrc, /isImpersonationCustomerSession failed/);
});


test('dual session: admin cookie preserved during impersonation', () => {
  const startSrc = readFileSync(
    join(process.cwd(), 'src/lib/auth/impersonation.ts'),
    'utf8',
  );
  assert.doesNotMatch(startSrc, /destroyAdminSession/);
  assert.match(startSrc, /applyImpersonationCookie/);

  const logoutSrc = readFileSync(join(process.cwd(), 'app/api/auth/logout/route.ts'), 'utf8');
  assert.match(logoutSrc, /IMPERSONATION_COOKIE/);
  assert.match(logoutSrc, /endResidentImpersonation/);
});

test('only super admin may start impersonation', () => {
  const api = readFileSync(
    join(process.cwd(), 'app/api/admin/impersonation/start/route.ts'),
    'utf8',
  );
  assert.match(api, /super_admin/);

  const guards = readFileSync(join(process.cwd(), 'src/lib/auth/guards.ts'), 'utf8');
  assert.match(guards, /requireSuperAdmin/);
  assert.match(guards, /session\.role !== 'super_admin'/);
});

test('requireCustomerSession skips mustSetPassword while impersonating', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth/guards.ts'), 'utf8');
  assert.match(src, /getActiveImpersonationContext/);
  assert.match(src, /!impersonating/);
});

test('customer session refresh skipped for impersonation sessions', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
  assert.match(src, /isImpersonationCustomerSession/);
  assert.match(src, /impersonating/);
  assert.match(src, /expiresAt\?: Date/);
});

test('credential changes blocked while impersonating', () => {
  const guardSrc = readFileSync(
    join(process.cwd(), 'src/lib/auth/impersonationGuards.ts'),
    'utf8',
  );
  assert.match(guardSrc, /getActiveImpersonationContext/);
  assert.match(guardSrc, /IMPERSONATION_BLOCKED_MESSAGE/);

  for (const file of [
    'app/api/auth/customer/change-password/route.ts',
    'app/api/auth/customer/set-password/route.ts',
    'app/api/auth/customer/sessions/route.ts',
  ]) {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    assert.match(src, /getImpersonationCredentialBlock/);
  }
});

test('impersonation audit table migration defines required fields', () => {
  const sql = readFileSync(
    join(process.cwd(), 'src/db/migrations/0139_admin_resident_impersonations.sql'),
    'utf8',
  );
  for (const col of [
    'admin_id',
    'customer_id',
    'reason',
    'started_at',
    'ended_at',
    'duration_seconds',
    'ip',
    'user_agent',
    'device_label',
    'browser',
    'operating_system',
    'request_id',
    'admin_return_path',
    'exit_reason',
  ]) {
    assert.match(sql, new RegExp(col));
  }
});

test('customer layout shows banner and debug panel only while impersonating', () => {
  const src = readFileSync(join(process.cwd(), 'app/(customer)/layout.tsx'), 'utf8');
  assert.match(src, /ImpersonationBanner/);
  assert.match(src, /ImpersonationDebugPanel/);
  assert.match(src, /getActiveImpersonationContext/);
});

test('ending impersonation preserves customer session id on audit row', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth/impersonation.ts'), 'utf8');
  assert.match(src, /expireCustomerSessionKeepRow/);
  assert.match(src, /customer_session_id FK on the audit row is preserved/);
  const sessionSrc = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
  assert.match(sessionSrc, /export async function expireCustomerSessionKeepRow/);
});

test('resident profile exposes impersonation controls for super admin', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/residents/[customerId]/page.tsx'),
    'utf8',
  );
  assert.match(page, /ResidentImpersonationPanel/);
  assert.match(page, /isSuperAdmin/);
  assert.match(page, /listImpersonationAuditForCustomer/);
});
