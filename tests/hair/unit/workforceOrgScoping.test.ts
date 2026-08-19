import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('platform initial migration quotes reserved limit column', () => {
  const sql = readFileSync('src/platform/db/migrations/0001_platform_initial.sql', 'utf8');
  assert.match(sql, /"limit"\s+integer/);
  assert.ok(!sql.match(/\n\s+limit\s+integer,/));
});

test('listEmployeesForEngine accepts organizationId scoping option', async () => {
  const { listEmployeesForEngine } = await import('@/src/workforce/brains/employeeBrain');
  assert.equal(typeof listEmployeesForEngine, 'function');
});
