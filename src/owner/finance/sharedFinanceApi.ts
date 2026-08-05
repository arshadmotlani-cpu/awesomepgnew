/**
 * Shared Finance API — Owner OS integration surface.
 * Re-exports Personal Finance Brain; never reimplements Engine math.
 */
export {
  getPersonalFinanceSnapshot,
  explainMetric,
  getOwnerLifeDashboard,
  isPersonalFinanceOsEnabled,
} from '@/src/personalFinance';
export type { ExplainableValue, PersonalFinanceSnapshot } from '@/src/personalFinance';
