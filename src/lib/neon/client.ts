import type { NeonBranch } from '@/src/lib/neon/types';

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

export class NeonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'NeonApiError';
  }
}

async function neonFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${NEON_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function listNeonBranches(
  apiKey: string,
  projectId: string,
): Promise<NeonBranch[]> {
  const res = await neonFetch(apiKey, `/projects/${projectId}/branches`);
  if (!res.ok) {
    const body = await res.text();
    throw new NeonApiError(`Neon list branches failed (${res.status})`, res.status, body);
  }
  const json = (await res.json()) as { branches?: NeonBranch[] };
  return json.branches ?? [];
}

export async function deleteNeonBranch(
  apiKey: string,
  projectId: string,
  branchId: string,
): Promise<void> {
  const res = await neonFetch(apiKey, `/projects/${projectId}/branches/${branchId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new NeonApiError(`Neon delete branch failed (${res.status})`, res.status, body);
  }
}
