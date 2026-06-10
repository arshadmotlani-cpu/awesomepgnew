import { logger } from '@/src/lib/logger';
import { getWatchdogWarmupMs, isWatchdogEnabled } from '@/src/lib/deploy/config';
import { runHealthChecks, type HealthCheckReport } from '@/src/lib/deploy/healthChecks';
import { recordDeploymentEvent } from '@/src/lib/deploy/persistence';
import { triggerAutoRollback } from '@/src/lib/deploy/rollback';
import { patchDeployTracker } from '@/src/lib/deploy/tracker';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WatchdogResult = {
  skipped: boolean;
  deploymentId: string;
  warmupMs: number;
  report: HealthCheckReport;
  rollback?: Awaited<ReturnType<typeof triggerAutoRollback>>;
  stable: boolean;
};

/**
 * Post-deploy watchdog — warm-up, health checks, optional auto-rollback.
 * Never throws; always returns a structured result.
 */
export async function runDeployWatchdog(
  deploymentId: string,
  opts?: { baseUrl?: string; skipWarmup?: boolean },
): Promise<WatchdogResult> {
  if (!isWatchdogEnabled()) {
    const report = await runHealthChecks(opts?.baseUrl);
    return {
      skipped: true,
      deploymentId,
      warmupMs: 0,
      report,
      stable: report.ok,
    };
  }

  const warmupMs = opts?.skipWarmup ? 0 : getWatchdogWarmupMs();

  patchDeployTracker({
    latestDeploymentId: deploymentId,
    status: 'checking',
  });
  await recordDeploymentEvent(deploymentId, 'checking', 'Watchdog started');

  logger.info('deploy watchdog: warming up', { deploymentId, warmupMs });

  if (warmupMs > 0) {
    await sleep(warmupMs);
  }

  const report = await runHealthChecks(opts?.baseUrl);

  if (report.ok) {
    patchDeployTracker({
      status: 'stable',
      latestDeploymentId: deploymentId,
      lastStableDeploymentId: deploymentId,
    });
    await recordDeploymentEvent(deploymentId, 'stable', report.summary);
    logger.info('deploy watchdog: deployment stable', { deploymentId });

    return { skipped: false, deploymentId, warmupMs, report, stable: true };
  }

  logger.warn('deploy watchdog: health checks failed', {
    deploymentId,
    summary: report.summary,
  });

  const rollback = await triggerAutoRollback(deploymentId, report);

  return {
    skipped: false,
    deploymentId,
    warmupMs,
    report,
    rollback,
    stable: false,
  };
}

/** Re-check health after rollback (recovery loop). */
export async function runPostRollbackRecoveryCheck(baseUrl?: string): Promise<HealthCheckReport> {
  const report = await runHealthChecks(baseUrl);
  if (report.ok) {
    logger.info('deploy watchdog: post-rollback recovery OK');
  }
  return report;
}
