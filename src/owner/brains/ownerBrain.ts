/**
 * Owner Brain — presentation API for Owner OS.
 * Consumes Personal Finance Brain; does not recalculate Engine money.
 */
import { getPersonalFinanceSnapshot } from '@/src/personalFinance/brains/personalFinanceBrain';
import type { PersonalFinanceSnapshot } from '@/src/personalFinance/types';
import { OWNER_OS_BRAIN_REGISTRY, type OwnerOsBrainEntry } from '@/src/owner/brains/registry';
import { getNetWorthSnapshot } from '@/src/owner/brains/netWorthBrain';
import { loadRecentOwnerEvents, type OwnerRecentEvent } from '@/src/owner/lib/events/recentEvents';
import {
  loadOwnerBrainHealthSnapshot,
  type OwnerBrainHealthSnapshot,
} from '@/src/owner/lib/health/brainHealthSnapshot';
import { loadOwnerTasks, type OwnerTaskItem } from '@/src/owner/lib/tasks/ownerTasksComposer';

export type OwnerOsSnapshot = {
  title: string;
  subtitle: string;
  finance: PersonalFinanceSnapshot;
  netWorth: Awaited<ReturnType<typeof getNetWorthSnapshot>>;
  brainHealth: OwnerBrainHealthSnapshot | null;
  tasks: OwnerTaskItem[];
  recentEvents: OwnerRecentEvent[];
  brainRegistry: OwnerOsBrainEntry[];
  asOf: string;
};

export async function getOwnerOsSnapshot(opts?: { billingMonth?: string }): Promise<OwnerOsSnapshot> {
  const finance = await getPersonalFinanceSnapshot(opts);

  const [netWorth, brainHealth, tasks, recentEvents] = await Promise.all([
    getNetWorthSnapshot({ finance }),
    loadOwnerBrainHealthSnapshot(),
    loadOwnerTasks(finance),
    loadRecentOwnerEvents(),
  ]);

  return {
    title: 'Owner OS',
    subtitle: 'Personal Finance Brain · explainable life metrics',
    finance,
    netWorth,
    brainHealth,
    tasks,
    recentEvents,
    brainRegistry: OWNER_OS_BRAIN_REGISTRY,
    asOf: finance.asOf,
  };
}

export { getOwnerLifeDashboard } from '@/src/personalFinance/brains/ownerOs';
