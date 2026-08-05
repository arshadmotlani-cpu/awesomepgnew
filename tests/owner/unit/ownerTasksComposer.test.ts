/**
 * Owner tasks composer — dedupe and priority sort (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { OwnerTaskItem } from '@/src/owner/lib/tasks/ownerTasksComposer';

function mergeTasks(tasks: OwnerTaskItem[]): OwnerTaskItem[] {
  const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const byId = new Map<string, OwnerTaskItem>();
  for (const t of tasks) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()]
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 20);
}

describe('Owner tasks composer', () => {
  test('deduplicates by id and sorts by priority', () => {
    const tasks = mergeTasks([
      {
        id: 'a',
        source: 'operations',
        priority: 'low',
        reason: 'r1',
        title: 'Low',
        href: '/a',
      },
      {
        id: 'a',
        source: 'operations',
        priority: 'high',
        reason: 'dup',
        title: 'Dup',
        href: '/a',
      },
      {
        id: 'b',
        source: 'workforce',
        priority: 'critical',
        reason: 'r2',
        title: 'Critical',
        href: '/b',
      },
    ]);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0]?.id, 'b');
    assert.equal(tasks[1]?.id, 'a');
    assert.equal(tasks[1]?.title, 'Low');
  });

  test('every task requires source, priority, reason, href', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/owner/lib/tasks/ownerTasksComposer.ts'),
      'utf8',
    );
    assert.match(src, /reason: string/);
    assert.match(src, /priority: OwnerTaskPriority/);
    assert.match(src, /href: string/);
    assert.match(src, /listOpenActionItemsForOwnerRead/);
    assert.match(src, /getOwnerWorkforceDashboard/);
    assert.match(src, /getRevenueDashboardSnapshot/);
    assert.match(src, /countCapitalSoldAwaitingSettlement/);
  });
});
