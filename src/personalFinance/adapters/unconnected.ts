import { moneyValue } from '@/src/personalFinance/explain';
import type { ExplainableValue } from '@/src/personalFinance/types';

/** Future personal engines — explainable zeros until connected. */
export function unconnectedMoney(
  id: string,
  label: string,
  engineLabel: string,
): ExplainableValue {
  return moneyValue({
    id,
    label,
    paise: 0,
    brain: 'personal_finance',
    engine: 'unconnected',
    calculation: `${engineLabel} not connected — Personal Finance consumes when Engine ships`,
    sourceApi: 'unconnected',
    provisional: true,
    lineage: [],
  });
}
