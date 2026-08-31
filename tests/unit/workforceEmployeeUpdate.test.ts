import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function readSrc(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('employee profile save is section-scoped', () => {
  test('credentials save does not force canLogin false or wipe incentives', () => {
    const src = readSrc('src/workforce/actions/employees.ts');
    assert.match(src, /if \(section === 'credentials'\)/);
    assert.match(src, /if \(section === 'schedule'\)/);
    const credBlock = src.split("section === 'credentials'")[1]?.split("section === 'schedule'")[0] ?? '';
    assert.match(credBlock, /qrCodeUrl/);
    assert.doesNotMatch(credBlock, /canLogin:/);
    assert.doesNotMatch(credBlock, /incentivePlan:/);
    assert.doesNotMatch(credBlock, /permissions:/);
  });

  test('staff-details only sets canLogin when a new password is provided', () => {
    const src = readSrc('src/workforce/actions/employees.ts');
    assert.match(src, /password\.length >= 6 \? \{ password, canLogin: true \}/);
  });

  test('schedule save passes resolved tenant into updateEmployee', () => {
    const src = readSrc('src/workforce/actions/employees.ts');
    const sched = src.split("section === 'schedule'")[1]?.split("section === 'salary'")[0] ?? '';
    assert.match(sched, /resolveEmployeeCreateTenant/);
    assert.match(sched, /locationId: tenant\.locationId/);
  });

  test('profile QR is a file field uploaded before the server action', () => {
    const panel = readSrc('src/workforce/components/EmployeeProfilePanel.tsx');
    assert.match(panel, /name="qrCodeFile"/);
    assert.doesNotMatch(panel, /name="qrCodeUrl"/);
    assert.match(panel, /persistQrFileInFormData/);
    assert.match(panel, /handleProfileSubmit/);
    assert.doesNotMatch(panel, /action=\{action\}/);
    const api = readSrc('app/(hair)/fyh/api/staff/qr/route.ts');
    assert.match(api, /persistEmployeeQrFromFile/);
  });

  test('update audit never stores raw QR payloads', () => {
    const src = readSrc('src/workforce/services/employees.ts');
    assert.match(src, /qrCodeUrl: input\.qrCodeUrl \? '\[qr\]'/);
  });

  test('successful create returns a clean success state', () => {
    const src = readSrc('src/workforce/actions/employees.ts');
    assert.match(src, /success: 'Employee created\.'/);
    assert.doesNotMatch(src, /e instanceof Error \? e\.message/);
  });
});
