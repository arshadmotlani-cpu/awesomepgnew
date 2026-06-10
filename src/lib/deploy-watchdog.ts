/** Public entrypoint for the deploy watchdog system. */
export { runDeployWatchdog, runPostRollbackRecoveryCheck } from '@/src/lib/deploy/watchdog';
export { runHealthChecks } from '@/src/lib/deploy/healthChecks';
export { triggerAutoRollback } from '@/src/lib/deploy/rollback';
