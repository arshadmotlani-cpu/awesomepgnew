import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  parseNeonBranchCleanupConfig,
  runNeonBranchCleanup,
} from '@/src/lib/neon/branchCleanup';
import { runVercelPreviewDeploymentCleanup } from '@/src/lib/vercel/previewDeploymentCleanup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, reason: 'CRON_SECRET is not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const neonConfig = parseNeonBranchCleanupConfig();
  if (!neonConfig) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: 'NEON_API_KEY or NEON_PROJECT_ID not configured',
    });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  let vercel: Awaited<ReturnType<typeof runVercelPreviewDeploymentCleanup>> | null = null;

  const vercelToken = process.env.VERCEL_TOKEN?.trim();
  const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (vercelToken && vercelProjectId) {
    vercel = await runVercelPreviewDeploymentCleanup({
      token: vercelToken,
      projectId: vercelProjectId,
      retentionDays: neonConfig.retentionDays,
      dryRun,
    });
  }

  const neon = await runNeonBranchCleanup({ config: neonConfig, dryRun });

  return Response.json({
    ok: true,
    dryRun,
    neon: {
      listed: neon.listed,
      protected: neon.protected,
      candidateCount: neon.candidates.length,
      deleted: neon.deleted,
      failed: neon.failed,
      candidates: neon.candidates.map(({ branch, reason }) => ({
        id: branch.id,
        name: branch.name,
        reason,
      })),
    },
    vercel: vercel
      ? {
          listed: vercel.listed,
          candidateCount: vercel.candidates.length,
          deleted: vercel.deleted,
          failed: vercel.failed,
        }
      : null,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
