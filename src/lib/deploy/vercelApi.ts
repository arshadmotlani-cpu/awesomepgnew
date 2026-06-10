import { getVercelApiConfig } from '@/src/lib/deploy/config';

export type VercelDeployment = {
  id: string;
  url: string;
  state: string;
  readyState?: string;
  createdAt: number;
  target?: string | null;
};

function apiUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`https://api.vercel.com${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function vercelFetch<T>(path: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  const cfg = getVercelApiConfig();
  if (!cfg) {
    throw new Error('VERCEL_TOKEN and VERCEL_PROJECT_ID are required for deploy watchdog');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${cfg.token}`);
  headers.set('Content-Type', 'application/json');

  const q = { ...query, ...(cfg.teamId ? { teamId: cfg.teamId } : {}) };
  const res = await fetch(apiUrl(path, q), { ...init, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

export async function listProductionDeployments(limit = 10): Promise<VercelDeployment[]> {
  const cfg = getVercelApiConfig();
  if (!cfg) return [];

  const data = await vercelFetch<{ deployments: VercelDeployment[] }>(
    '/v6/deployments',
    { method: 'GET' },
    { projectId: cfg.projectId, limit: String(limit), target: 'production' },
  );

  return data.deployments ?? [];
}

export async function getLatestProductionDeployment(): Promise<VercelDeployment | null> {
  const list = await listProductionDeployments(1);
  return list[0] ?? null;
}

export async function getPreviousProductionDeployment(
  currentId: string,
): Promise<VercelDeployment | null> {
  const list = await listProductionDeployments(10);
  const idx = list.findIndex((d) => d.id === currentId);
  if (idx >= 0 && list[idx + 1]) return list[idx + 1];
  return list.find((d) => d.id !== currentId) ?? null;
}

/** Instant rollback — points production domains at deploymentId. */
export async function rollbackProductionTo(
  deploymentId: string,
  description: string,
): Promise<void> {
  const cfg = getVercelApiConfig();
  if (!cfg) {
    throw new Error('Cannot rollback: Vercel API not configured');
  }

  await vercelFetch(
    `/v1/projects/${cfg.projectId}/rollback/${deploymentId}`,
    { method: 'POST' },
    { description },
  );
}
