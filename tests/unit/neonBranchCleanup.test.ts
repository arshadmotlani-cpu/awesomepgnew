import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProtectedNeonBranch,
  selectNeonBranchesForCleanup,
} from '../../src/lib/neon/branchCleanup';
import type { NeonBranch } from '../../src/lib/neon/types';
import { selectStaleVercelPreviewDeployments } from '../../src/lib/vercel/previewDeploymentCleanup';

const protectedNames = new Set(['main', 'production']);

function branch(partial: Partial<NeonBranch> & Pick<NeonBranch, 'id' | 'name'>): NeonBranch {
  return {
    primary: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('selectNeonBranchesForCleanup', () => {
  it('never selects primary or protected branches', () => {
    const branches = [
      branch({ id: 'br-main', name: 'main', primary: true }),
      branch({ id: 'br-prod', name: 'production' }),
      branch({
        id: 'br-old',
        name: 'cursor/old-feature-0921',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ];
    const now = Date.parse('2026-07-03T00:00:00.000Z');
    const selected = selectNeonBranchesForCleanup(
      branches,
      {
        retentionDays: 7,
        headroom: 2,
        maxBranches: null,
        protectedNames,
      },
      now,
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.branch.name, 'cursor/old-feature-0921');
    assert.equal(selected[0]?.reason, 'stale');
  });

  it('prunes oldest previews when over branch limit', () => {
    const branches = [
      branch({ id: 'br-main', name: 'main', primary: true }),
      branch({
        id: 'br-a',
        name: 'preview-a',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      }),
      branch({
        id: 'br-b',
        name: 'preview-b',
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-20T00:00:00.000Z',
      }),
      branch({
        id: 'br-c',
        name: 'preview-c',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      }),
    ];
    const now = Date.parse('2026-07-03T00:00:00.000Z');
    const selected = selectNeonBranchesForCleanup(
      branches,
      {
        retentionDays: 30,
        headroom: 1,
        maxBranches: 3,
        protectedNames,
      },
      now,
    );
    const names = selected.map((s) => s.branch.name);
    assert.deepEqual(names, ['preview-a', 'preview-b']);
    assert.equal(selected[0]?.reason, 'stale');
    assert.equal(selected[1]?.reason, 'over_limit');
  });
});

describe('isProtectedNeonBranch', () => {
  it('treats primary branch as protected', () => {
    assert.equal(
      isProtectedNeonBranch(branch({ id: 'x', name: 'anything', primary: true }), protectedNames),
      true,
    );
  });
});

describe('selectStaleVercelPreviewDeployments', () => {
  it('selects preview deployments older than retention', () => {
    const now = Date.parse('2026-07-10T00:00:00.000Z');
    const selected = selectStaleVercelPreviewDeployments(
      [
        {
          uid: 'dpl_old',
          name: 'old',
          url: 'https://example.com',
          created: Date.parse('2026-06-01T00:00:00.000Z'),
        },
        {
          uid: 'dpl_new',
          name: 'new',
          url: 'https://example.com',
          created: Date.parse('2026-07-09T00:00:00.000Z'),
        },
      ],
      7,
      now,
    );
    assert.deepEqual(selected.map((d) => d.uid), ['dpl_old']);
  });
});
