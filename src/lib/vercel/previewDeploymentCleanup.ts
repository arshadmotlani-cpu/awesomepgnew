export type VercelDeployment = {
  uid: string;
  name: string;
  url: string;
  created: number;
  state?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
  };
};

export type VercelPreviewCleanupResult = {
  listed: number;
  candidates: VercelDeployment[];
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
  dryRun: boolean;
};


export async function listVercelPreviewDeployments(options: {
  token: string;
  projectId: string;
  limit?: number;
}): Promise<VercelDeployment[]> {
  const url = new URL('https://api.vercel.com/v6/deployments');
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) url.searchParams.set('teamId', teamId);
  url.searchParams.set('projectId', options.projectId);
  url.searchParams.set('target', 'preview');
  url.searchParams.set('limit', String(options.limit ?? 100));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel list deployments failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { deployments?: VercelDeployment[] };
  return json.deployments ?? [];
}

export async function deleteVercelDeployment(token: string, deploymentId: string): Promise<void> {
  const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel delete deployment failed (${res.status}): ${body}`);
  }
}

export function selectStaleVercelPreviewDeployments(
  deployments: VercelDeployment[],
  retentionDays: number,
  now = Date.now(),
): VercelDeployment[] {
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return deployments
    .filter((d) => now - d.created >= retentionMs)
    .sort((a, b) => a.created - b.created);
}

export async function runVercelPreviewDeploymentCleanup(options: {
  token: string;
  projectId: string;
  retentionDays: number;
  dryRun?: boolean;
  now?: number;
}): Promise<VercelPreviewCleanupResult> {
  const { dryRun = true, now = Date.now() } = options;
  const listed = await listVercelPreviewDeployments({
    token: options.token,
    projectId: options.projectId,
  });
  const candidates = selectStaleVercelPreviewDeployments(
    listed,
    options.retentionDays,
    now,
  );

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  if (!dryRun) {
    for (const deployment of candidates) {
      try {
        await deleteVercelDeployment(options.token, deployment.uid);
        deleted.push(deployment.uid);
      } catch (err) {
        failed.push({
          id: deployment.uid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    listed: listed.length,
    candidates,
    deleted,
    failed,
    dryRun,
  };
}
