export type NeonBranch = {
  id: string;
  name: string;
  primary: boolean;
  created_at: string;
  updated_at: string;
  /** Present when Neon auto-archived an idle branch. */
  archived?: boolean;
};

export type NeonBranchCleanupConfig = {
  projectId: string;
  apiKey: string;
  retentionDays: number;
  headroom: number;
  maxBranches: number | null;
  protectedNames: Set<string>;
};

export type NeonBranchCleanupCandidate = {
  branch: NeonBranch;
  reason: 'stale' | 'over_limit';
};

export type NeonBranchCleanupResult = {
  listed: number;
  protected: number;
  candidates: NeonBranchCleanupCandidate[];
  deleted: string[];
  failed: Array<{ branch: string; error: string }>;
  dryRun: boolean;
};
