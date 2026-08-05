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
  };
}

/** Sum money explainables — Personal Finance Brain aggregation only (no Engine math). */
export function sumMoney(
  id: string,
  label: string,
  parts: ExplainableValue[],
  calculation: string,
): ExplainableValue {
  const paise = parts.reduce((s, p) => s + p.paise, 0);
  return moneyValue({
    id,
    label,
    paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation,
    sourceApi: 'personalFinance.compose',
    lineage: parts.map((p) => ({
      label: `${p.engine}: ${p.label}`,
      paise: p.paise,
      ref: p.id,
    })),
  });
}
