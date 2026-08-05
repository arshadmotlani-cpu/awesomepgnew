/**
 * Net Worth Brain — thin projection over Personal Finance snapshot.
 * Formula owned here only as composition of already-explainable assets/liabilities.
 */
import { getPersonalFinanceSnapshot } from '@/src/personalFinance/brains/personalFinanceBrain';
import type { ExplainableValue, PersonalFinanceSnapshot } from '@/src/personalFinance/types';

export type NetWorthSnapshot = {
  currentNetWorth: ExplainableValue;
  assets: ExplainableValue;
  liabilities: ExplainableValue;
  asOf: string;
};

export async function getNetWorthSnapshot(opts?: {
  billingMonth?: string;
  finance?: PersonalFinanceSnapshot;
}): Promise<NetWorthSnapshot> {
  const finance = opts?.finance ?? (await getPersonalFinanceSnapshot(opts));
  return {
    currentNetWorth: finance.currentNetWorth,
    assets: finance.assets,
    liabilities: finance.liabilities,
    asOf: finance.asOf,
  };
}
