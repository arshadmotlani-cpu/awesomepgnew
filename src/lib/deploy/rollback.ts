import { logger } from '@/src/lib/logger';
import { getPreviousProductionDeployment, rollbackProductionTo } from '@/src/lib/deploy/vercelApi';
import {
  getLatestStableDeploymentId,
  recordDeploymentEvent,
} from '@/src/lib/deploy/persistence';
import {
  getDeployTrackerState,
  hasRolledBackDeployment,
  markRolledBack,
  patchDeployTracker,
} from '@/src/lib/deploy/tracker';
import type { HealthCheckReport } from '@/src/lib/deploy/healthChecks';

export type RollbackResult = {
  performed: boolean;
  reason: string;
  rolledBackTo?: string;
};

export async function triggerAutoRollback(
  failedDeploymentId: string,
  report: HealthCheckReport,
): Promise<RollbackResult> {
  if (hasRolledBackDeployment(failedDeploymentId)) {
    return {
      performed: false,
      reason: 'Rollback already performed for this deployment (max 1 per deploy)',
    };
  }

  const tracker = getDeployTrackerState();
  let targetId = tracker.lastStableDeploymentId;

  if (!targetId) {
    targetId = await getLatestStableDeploymentId();
  }

  if (!targetId) {
    const previous = await getPreviousProductionDeployment(failedDeploymentId);
    targetId = previous?.id ?? null;
  }

  if (!targetId) {
    return { performed: false, reason: 'No previous stable deployment found to rollback to' };
  }

  if (targetId === failedDeploymentId) {
    return { performed: false, reason: 'Previous deployment is the same as failed deployment' };
  }

  const reason = `Watchdog auto-rollback: ${report.summary}`;

  try {
    patchDeployTracker({ status: 'rolling_back' });
    await recordDeploymentEvent(failedDeploymentId, 'rolling_back', reason);
    await rollbackProductionTo(targetId, reason);

    markRolledBack(failedDeploymentId);
    patchDeployTracker({
      status: 'failed',
      latestDeploymentId: failedDeploymentId,
      lastStableDeploymentId: targetId,
    });
    await recordDeploymentEvent(failedDeploymentId, 'failed', reason);

    logger.error('deploy watchdog: auto-rollback executed', {
      failedDeploymentId,
      rolledBackTo: targetId,
      summary: report.summary,
    });

    return { performed: true, reason, rolledBackTo: targetId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('deploy watchdog: rollback failed', { message, failedDeploymentId, targetId });
    return { performed: false, reason: `Rollback API failed: ${message}` };
  }
}
