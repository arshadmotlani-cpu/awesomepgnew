import { moneyValue, percentValue } from '@/src/personalFinance/explain';
import type { ExplainableValue } from '@/src/personalFinance/types';

/** Future personal engines — show "Not Connected" in UI (never fake ₹0). */
export function notConnectedMoney(
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
    calculation: `${engineLabel} not connected — connect Engine to populate`,
    sourceApi: 'not_connected',
    connected: false,
    provisional: true,
    lineage: [],
  });
}

/** @deprecated Use notConnectedMoney — kept for adapter imports during migration */
export function unconnectedMoney(
  id: string,
  label: string,
  engineLabel: string,
): ExplainableValue {
  return notConnectedMoney(id, label, engineLabel);
}

export function notConnectedPercent(id: string, label: string, engineLabel: string): ExplainableValue {
  return percentValue({
    id,
    label,
    percent: 0,
    brain: 'personal_finance',
    engine: 'unconnected',
    calculation: `${engineLabel} not connected`,
    sourceApi: 'not_connected',
    connected: false,
    provisional: true,
    lineage: [],
  });
}
