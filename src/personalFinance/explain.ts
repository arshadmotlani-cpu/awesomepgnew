import type {
  ExplainLineageItem,
  ExplainableValue,
  FinanceBrainId,
  FinanceEngineId,
} from '@/src/personalFinance/types';

export function moneyValue(input: {
  id: string;
  label: string;
  paise: number;
  brain: FinanceBrainId;
  engine: FinanceEngineId;
  calculation: string;
  sourceApi: string;
  lineage?: ExplainLineageItem[];
  provisional?: boolean;
  connected?: boolean;
}): ExplainableValue {
  return {
    id: input.id,
    label: input.label,
    paise: Math.round(input.paise),
    kind: 'money',
    brain: input.brain,
    engine: input.engine,
    calculation: input.calculation,
    sourceApi: input.sourceApi,
    lineage: input.lineage ?? [],
    provisional: input.provisional,
    connected: input.connected ?? true,
  };
}

export function percentValue(input: {
  id: string;
  label: string;
  percent: number;
  brain: FinanceBrainId;
  engine: FinanceEngineId;
  calculation: string;
  sourceApi: string;
  lineage?: ExplainLineageItem[];
  provisional?: boolean;
  connected?: boolean;
}): ExplainableValue {
  return {
    id: input.id,
    label: input.label,
    paise: 0,
    kind: 'percent',
    percent: input.percent,
    brain: input.brain,
    engine: input.engine,
    calculation: input.calculation,
    sourceApi: input.sourceApi,
    lineage: input.lineage ?? [],
    provisional: input.provisional,
    connected: input.connected ?? true,
  };
}

/** Sum connected money explainables only — Personal Finance Brain aggregation. */
export function sumMoney(
  id: string,
  label: string,
  parts: ExplainableValue[],
  calculation: string,
): ExplainableValue {
  const connectedParts = parts.filter((p) => p.connected !== false);
  const paise = connectedParts.reduce((s, p) => s + p.paise, 0);
  return moneyValue({
    id,
    label,
    paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation,
    sourceApi: 'personalFinance.compose',
    connected: connectedParts.length > 0,
    lineage: connectedParts.map((p) => ({
      label: `${p.engine}: ${p.label}`,
      paise: p.paise,
      ref: p.id,
    })),
  });
}

export function isMetricConnected(v: ExplainableValue): boolean {
  return v.connected !== false;
}

/** Derived metrics connect only when every dependency is connected. */
export function connectedIfAllConnected(parts: ExplainableValue[]): boolean {
  return parts.length > 0 && parts.every((p) => p.connected !== false);
}

export function formatMetricDisplay(v: ExplainableValue): string {
  if (!isMetricConnected(v)) return 'Not Connected';
  if (v.kind === 'percent' || v.kind === 'ratio') {
    return `${v.percent ?? 0}%`;
  }
  const inr = v.paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(inr);
}
