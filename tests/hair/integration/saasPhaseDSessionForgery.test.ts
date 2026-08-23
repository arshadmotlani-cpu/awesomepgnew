import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfAuthSessions, wfEmployees } from '@/src/workforce/db/schema';
import { updateWorkforceSessionTenant } from '@/src/workforce/auth/session';
import { isOrgCookieForge } from '@/src/hair/lib/tenant/resolveTenantContext';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('Phase D hostile session forgery / org switch (session row SSOT)', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const attackLog: string[] = [];
  const expectDeny = (name: string, denied: boolean, detail: string) => {
    attackLog.push(`[${denied ? 'DENY' : 'LEAK'}] ${name} — ${detail}`);
    assert.ok(denied, `${name}: ${detail}`);
  };

  const now = Date.now();
  const orgA = `00000000-0000-4000-a000-${String(now).slice(-12)}`;
  const orgB = `00000000-0000-4000-a001-${String(now + 1).slice(-12)}`;
  const locA = `10000000-0000-4000-a000-${String(now + 2).slice(-12)}`;
  const locB = `10000000-0000-4000-a001-${String(now + 3).slice(-12)}`;

  const [emp] = await hairDb
    .select({ id: wfEmployees.id, organizationId: wfEmployees.organizationId })
    .from(wfEmployees)
    .where(eq(wfEmployees.status, 'active'))
    .limit(1);
  if (!emp?.organizationId) {
    t.skip('No active workforce employee to attach a synthetic session');
    return;
  }

  const tokenHash = `phase-d-forge-${now}`;
  const [session] = await hairDb
    .insert(wfAuthSessions)
    .values({
      employeeId: emp.id,
      organizationId: orgA,
      locationId: locA,
      tokenHash,
      expiresAt: new Date(Date.now() + 86_400_000),
      activeEngineId: 'fyh_salon',
    })
    .returning({ id: wfAuthSessions.id, organizationId: wfAuthSessions.organizationId });

  expectDeny(
    'D1 cookie Org B while session Org A is forge',
    isOrgCookieForge(session!.organizationId, orgB),
    `session=${session!.organizationId} cookie=${orgB}`,
  );

  expectDeny(
    'D2 matching cookie is not forge',
    !isOrgCookieForge(session!.organizationId, orgA),
    'same org cookie',
  );

  await updateWorkforceSessionTenant({
    sessionId: session!.id,
    organizationId: orgB,
    locationId: locB,
  });

  const [after] = await hairDb
    .select({
      organizationId: wfAuthSessions.organizationId,
      locationId: wfAuthSessions.locationId,
    })
    .from(wfAuthSessions)
    .where(and(eq(wfAuthSessions.id, session!.id), isNull(wfAuthSessions.revokedAt)))
    .limit(1);

  expectDeny(
    'D4 org switch updates session row to Org B',
    after?.organizationId === orgB && after?.locationId === locB,
    `got org=${after?.organizationId} loc=${after?.locationId}`,
  );

  expectDeny(
    'D4b post-switch cookie claiming Org A is forge',
    isOrgCookieForge(after!.organizationId!, orgA),
    'session B + cookie A',
  );

  await hairDb.delete(wfAuthSessions).where(eq(wfAuthSessions.id, session!.id));

  console.log('Phase D attack list:\n' + attackLog.join('\n'));
});
