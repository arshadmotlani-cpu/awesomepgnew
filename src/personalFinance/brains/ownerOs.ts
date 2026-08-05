/**
 * Owner OS — presentation of Personal Finance Brain + Owner Brain shell.
 */
import { getPersonalFinanceSnapshot } from '@/src/personalFinance/brains/personalFinanceBrain';
import type { PersonalFinanceSnapshot } from '@/src/personalFinance/types';

export type OwnerLifeDashboard = {
  title: string;
  subtitle: string;
  finance: PersonalFinanceSnapshot;
};

export async function getOwnerLifeDashboard(opts?: {
  billingMonth?: string;
}): Promise<OwnerLifeDashboard> {
  const finance = await getPersonalFinanceSnapshot(opts);
  return {
    title: 'Owner OS',
    subtitle: 'Your financial life across every Engine',
    finance,
  };
}
