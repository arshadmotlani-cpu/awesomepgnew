/**
 * Investment Brain (Owner OS) — consume Personal Finance / Capital contribution only.
 */
import { getPersonalFinanceSnapshot } from '@/src/personalFinance/brains/personalFinanceBrain';
import type { ExplainableValue } from '@/src/personalFinance/types';

export type InvestmentSlice = {
  investmentValue: ExplainableValue;
  vehiclePortfolio: ExplainableValue;
  roiPct: ExplainableValue;
  asOf: string;
};

export async function getInvestmentSlice(opts?: {
  billingMonth?: string;
}): Promise<InvestmentSlice> {
  const finance = await getPersonalFinanceSnapshot(opts);
  return {
    investmentValue: finance.investmentValue,
    vehiclePortfolio: finance.vehiclePortfolio,
    roiPct: finance.roiPct,
    asOf: finance.asOf,
  };
}
