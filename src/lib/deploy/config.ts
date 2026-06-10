export function getWatchdogBaseUrl(): string {
  const explicit =
    process.env.WATCHDOG_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return 'http://localhost:3000';
}

export function getVercelApiConfig(): {
  token: string;
  projectId: string;
  teamId?: string;
} | null {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return { token, projectId, teamId };
}

export function getWatchdogWarmupMs(): number {
  const raw = process.env.WATCHDOG_WARMUP_MS;
  if (!raw) return 15_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 15_000;
}

export function isWatchdogEnabled(): boolean {
  return process.env.WATCHDOG_ENABLED !== 'false';
}
