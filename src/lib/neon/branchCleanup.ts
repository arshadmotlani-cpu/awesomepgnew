import { deleteNeonBranch, listNeonBranches } from '@/src/lib/neon/client';
import type {
  NeonBranch,
  NeonBranchCleanupCandidate,
  NeonBranchCleanupConfig,
  NeonBranchCleanupResult,
} from '@/src/lib/neon/types';

const DEFAULT_PROTECTED = new Set(['main', 'production', 'master', 'default']);

export function parseNeonBranchCleanupConfig(
  env: NodeJS.ProcessEnv = process.env,
): NeonBranchCleanupConfig | null {
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;

  const retentionDays = Math.max(1, Number(env.NEON_BRANCH_RETENTION_DAYS ?? 7) || 7);
  const headroom = Math.max(0, Number(env.NEON_BRANCH_HEADROOM ?? 2) || 2);
  const maxRaw = env.NEON_MAX_BRANCHES?.trim();
  const maxBranches = maxRaw ? Math.max(1, Number(maxRaw) || 10) : null;

  const extraProtected = (env.NEON_PROTECTED_BRANCHES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    projectId,
    apiKey,
    retentionDays,
    headroom,
    maxBranches,
    protectedNames: new Set([...DEFAULT_PROTECTED, ...extraProtected]),
  };
}

export function isProtectedNeonBranch(
  branch: NeonBranch,
  protectedNames: Set<string>,
): boolean {
  if (branch.primary) return true;
  return protectedNames.has(branch.name.toLowerCase());
}

function branchAgeMs(branch: NeonBranch, now = Date.now()): number {
  const stamp = branch.updated_at || branch.created_at;
  const parsed = Date.parse(stamp);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, now - parsed);
}

export function selectNeonBranchesForCleanup(
  branches: NeonBranch[],
  config: Pick<
    NeonBranchCleanupConfig,
    'retentionDays' | 'headroom' | 'maxBranches' | 'protectedNames'
  >,
  now = Date.now(),
): NeonBranchCleanupCandidate[] {
  const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
  const protectedBranches = branches.filter((b) =>
    isProtectedNeonBranch(b, config.protectedNames),
  );
  const deletable = branches
    .filter((b) => !isProtectedNeonBranch(b, config.protectedNames))
    .sort(
      (a, b) =>
        Date.parse(a.created_at || '') - Date.parse(b.created_at || '') ||
        a.name.localeCompare(b.name),
    );

  const candidates: NeonBranchCleanupCandidate[] = [];
  const seen = new Set<string>();

  for (const branch of deletable) {
    if (branchAgeMs(branch, now) >= retentionMs) {
      candidates.push({ branch, reason: 'stale' });
      seen.add(branch.id);
    }
  }

  if (config.maxBranches != null) {
    const limit = config.maxBranches;
    const targetCount = Math.max(protectedBranches.length, limit - config.headroom);
    const overflow = branches.length - targetCount;
    const remainingOverflow = Math.max(0, overflow - candidates.length);
    if (remainingOverflow > 0) {
      let overLimitAdded = 0;
      for (const branch of deletable) {
        if (seen.has(branch.id)) continue;
        candidates.push({ branch, reason: 'over_limit' });
        seen.add(branch.id);
        overLimitAdded += 1;
        if (overLimitAdded >= remainingOverflow) break;
      }
    }
  }

  return candidates;
}

export async function runNeonBranchCleanup(options: {
  config: NeonBranchCleanupConfig;
  dryRun?: boolean;
  now?: number;
}): Promise<NeonBranchCleanupResult> {
  const { config, dryRun = true, now = Date.now() } = options;
  const branches = await listNeonBranches(config.apiKey, config.projectId);
  const protectedCount = branches.filter((b) =>
    isProtectedNeonBranch(b, config.protectedNames),
  ).length;
  const candidates = selectNeonBranchesForCleanup(branches, config, now);

  const deleted: string[] = [];
  const failed: Array<{ branch: string; error: string }> = [];

  if (!dryRun) {
    for (const { branch } of candidates) {
      try {
        await deleteNeonBranch(config.apiKey, config.projectId, branch.id);
        deleted.push(branch.name);
      } catch (err) {
        failed.push({
          branch: branch.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    listed: branches.length,
    protected: protectedCount,
    candidates,
    deleted,
    failed,
    dryRun,
  };
}
