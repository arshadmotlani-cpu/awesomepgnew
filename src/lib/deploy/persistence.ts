import { desc, eq } from 'drizzle-orm';
import { deployments } from '@/src/db/schema/deployments';
import { runWithoutLogPersistence } from '@/src/lib/monitoring/logStore';

export type DeploymentStatus = 'stable' | 'failed' | 'rolling_back' | 'checking';

export async function recordDeploymentEvent(
  deploymentId: string,
  status: DeploymentStatus,
  errorSummary?: string | null,
): Promise<void> {
  try {
    await runWithoutLogPersistence(async () => {
      const { createClient } = await import('@/src/db/client');
      const { db, close } = createClient({ max: 1 });
      try {
        await db.insert(deployments).values({
          deploymentId,
          status,
          errorSummary: errorSummary ?? null,
        });
      } finally {
        await close();
      }
    });
  } catch {
    // Best-effort — watchdog must continue.
  }
}

export async function getLatestStableDeploymentId(): Promise<string | null> {
  try {
    return await runWithoutLogPersistence(async () => {
      const { createClient } = await import('@/src/db/client');
      const { db, close } = createClient({ max: 1 });
      try {
        const [row] = await db
          .select()
          .from(deployments)
          .where(eq(deployments.status, 'stable'))
          .orderBy(desc(deployments.createdAt))
          .limit(1);
        return row?.deploymentId ?? null;
      } finally {
        await close();
      }
    });
  } catch {
    return null;
  }
}

export async function listDeploymentEvents(limit = 50) {
  try {
    return await runWithoutLogPersistence(async () => {
      const { createClient } = await import('@/src/db/client');
      const { db, close } = createClient({ max: 1 });
      try {
        return await db
          .select()
          .from(deployments)
          .orderBy(desc(deployments.createdAt))
          .limit(limit);
      } finally {
        await close();
      }
    });
  } catch {
    return [];
  }
}
