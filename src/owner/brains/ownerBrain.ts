/**
 * Owner Brain — presentation API for Owner OS.
 * Consumes Personal Finance Brain; does not recalculate Engine money.
 */
import { getOwnerLifeDashboard } from '@/src/personalFinance/brains/ownerOs';
import { OWNER_OS_BRAIN_REGISTRY } from '@/src/owner/brains/registry';
import { getNetWorthSnapshot } from '@/src/owner/brains/netWorthBrain';

export async function getOwnerOsSnapshot(opts?: { billingMonth?: string }) {
  const [life, netWorth] = await Promise.all([
    getOwnerLifeDashboard(opts),
    getNetWorthSnapshot(opts),
  ]);

  return {
    title: life.title,
    subtitle: life.subtitle,
    finance: life.finance,
    netWorth,
    brainRegistry: OWNER_OS_BRAIN_REGISTRY,
    asOf: life.finance.asOf,
  };
}

export { getOwnerLifeDashboard };
