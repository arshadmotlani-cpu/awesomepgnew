'use client';

import { useMemo, useState } from 'react';
import {
  describeIncentiveRules,
  formatInrFromPaiseRule,
} from '@/src/workforce/lib/incentiveRuleEngine';
import type { SalonIncentiveRule } from '@/src/workforce/types/hr';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

export type IncentiveRuleRowState = {
  thresholdInr: string;
  percent: string;
  useSalaryMultiplier: boolean;
  salaryMultiplier: string;
};

type Props = {
  kind: 'service' | 'product';
  title: string;
  initialEnabled: boolean;
  initialRules: SalonIncentiveRule[];
  salaryPaise?: number;
  disabled?: boolean;
};

function rulesToRowState(rules: SalonIncentiveRule[]): IncentiveRuleRowState[] {
  return rules.map((rule) => ({
    thresholdInr: rule.thresholdPaise > 0 ? String(Math.round(rule.thresholdPaise / 100)) : '',
    percent: String(rule.percentBps / 100),
    useSalaryMultiplier: false,
    salaryMultiplier: '2',
  }));
}

function rowStateToRules(rows: IncentiveRuleRowState[], salaryPaise: number): SalonIncentiveRule[] {
  return rows.map((row, index) => {
    const percentBps = Math.round(Number(row.percent) * 100) || 0;
    let thresholdPaise = 0;
    if (index > 0) {
      if (row.useSalaryMultiplier && salaryPaise > 0) {
        const mult = Number(row.salaryMultiplier) || 2;
        thresholdPaise = Math.floor(salaryPaise * mult);
      } else if (row.thresholdInr) {
        thresholdPaise = Math.round(Number(row.thresholdInr) * 100);
      }
    }
    return { thresholdPaise, percentBps };
  });
}

function thresholdLabel(
  index: number,
  rows: IncentiveRuleRowState[],
  salaryPaise: number,
): string {
  if (index === 0 && rows.length === 1) {
    return 'Flat / Any amount';
  }
  const row = rows[index]!;
  if (row.useSalaryMultiplier && salaryPaise > 0) {
    const mult = Number(row.salaryMultiplier) || 2;
    const amount = Math.floor(salaryPaise * mult);
    return `${formatInrFromPaiseRule(amount)} and above`;
  }
  if (row.thresholdInr) {
    return `${formatInrFromPaiseRule(Math.round(Number(row.thresholdInr) * 100))} and above`;
  }
  return 'Set threshold';
}

function belowLabel(index: number, rows: IncentiveRuleRowState[], salaryPaise: number): string {
  if (index === 0 && rows.length > 1) {
    const next = rows[1]!;
    if (next.useSalaryMultiplier && salaryPaise > 0) {
      const mult = Number(next.salaryMultiplier) || 2;
      return `Below ${formatInrFromPaiseRule(Math.floor(salaryPaise * mult))}`;
    }
    if (next.thresholdInr) {
      return `Below ${formatInrFromPaiseRule(Math.round(Number(next.thresholdInr) * 100))}`;
    }
  }
  return thresholdLabel(index, rows, salaryPaise);
}

export function IncentiveRuleBuilder({
  kind,
  title,
  initialEnabled,
  initialRules,
  salaryPaise = 0,
  disabled = false,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rows, setRows] = useState<IncentiveRuleRowState[]>(() =>
    rulesToRowState(initialRules.length ? initialRules : [{ thresholdPaise: 0, percentBps: 500 }]),
  );

  const previewRules = useMemo(() => {
    try {
      return rowStateToRules(rows, salaryPaise);
    } catch {
      return [{ thresholdPaise: 0, percentBps: 500 }];
    }
  }, [rows, salaryPaise]);

  const explanations = useMemo(() => {
    try {
      return describeIncentiveRules(previewRules, kind);
    } catch {
      return [];
    }
  }, [previewRules, kind]);

  function updateRow(index: number, patch: Partial<IncentiveRuleRowState>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { thresholdInr: '', percent: '5', useSalaryMultiplier: false, salaryMultiplier: '2' },
    ]);
  }

  function removeRow(index: number) {
    if (index === 0) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--fyh-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
          {title}
        </h3>
        <label className="flex items-center gap-2 text-sm">
          {disabled ? (
            <input type="hidden" name={`${kind}IncentiveEnabled`} value={enabled ? '1' : '0'} />
          ) : (
            <>
              <input type="hidden" name={`${kind}IncentiveEnabled`} value="0" />
              <input
                type="checkbox"
                name={`${kind}IncentiveEnabled`}
                value="1"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="fyh-checkbox"
              />
            </>
          )}
          <span className="font-medium">Enabled</span>
        </label>
      </div>

      {enabled && !disabled ? (
        <>
          <input type="hidden" name={`${kind}RuleCount`} value={rows.length} />
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div
                key={`${kind}-rule-${index}`}
                className="grid gap-3 rounded-lg border border-[color:var(--fyh-border)] bg-black/10 p-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium text-fyh-text-secondary">
                    Rule {index + 1}
                    {rows.length === 1
                      ? ' · Flat percentage'
                      : index === 0
                        ? ` · ${belowLabel(index, rows, salaryPaise)}`
                        : ` · ${thresholdLabel(index, rows, salaryPaise)}`}
                  </p>
                  {index > 0 ? (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          name={`${kind}Rule_${index}_useSalaryMultiplier`}
                          value="1"
                          checked={row.useSalaryMultiplier}
                          onChange={(e) =>
                            updateRow(index, {
                              useSalaryMultiplier: e.target.checked,
                              thresholdInr: e.target.checked ? '' : row.thresholdInr,
                            })
                          }
                          disabled={disabled}
                          className="fyh-checkbox"
                        />
                        <span>Use salary multiplier</span>
                      </label>
                      {row.useSalaryMultiplier ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Input
                            name={`${kind}Rule_${index}_salaryMultiplier`}
                            type="number"
                            min={0.1}
                            step="0.1"
                            value={row.salaryMultiplier}
                            onChange={(e) => updateRow(index, { salaryMultiplier: e.target.value })}
                            disabled={disabled}
                            className="w-20"
                          />
                          <span className="text-fyh-text-secondary">× salary</span>
                        </div>
                      ) : (
                        <label className="block space-y-1 text-sm">
                          <span className="fyh-form-label">Performance from (₹)</span>
                          <Input
                            name={`${kind}Rule_${index}_thresholdInr`}
                            type="number"
                            min={0}
                            step="1"
                            value={row.thresholdInr}
                            onChange={(e) => updateRow(index, { thresholdInr: e.target.value })}
                            disabled={disabled}
                            placeholder="e.g. 24000"
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-fyh-text-secondary">
                      {rows.length === 1
                        ? 'Applies to all eligible performance.'
                        : 'Base rate for performance below the next level.'}
                    </p>
                  )}
                </div>
                <label className="space-y-1 text-sm">
                  <span className="fyh-form-label">Rate (%)</span>
                  <Input
                    name={`${kind}Rule_${index}_percent`}
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                    value={row.percent}
                    onChange={(e) => updateRow(index, { percent: e.target.value })}
                    disabled={disabled}
                    className="w-24"
                  />
                </label>
                <div className="flex items-end">
                  {index > 0 && !disabled ? (
                    <Button type="button" variant="secondary" onClick={() => removeRow(index)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {!disabled ? (
            <Button type="button" variant="secondary" onClick={addRow}>
              + Add performance level
            </Button>
          ) : null}

          {explanations.length > 0 ? (
            <div className="rounded-lg bg-[color:var(--fyh-surface-muted)] p-3 text-sm text-fyh-text-secondary">
              <p className="font-medium text-fyh-text">What this means</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {explanations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-fyh-text-secondary">
          {kind === 'service' ? 'Service' : 'Product'} incentive is disabled for this employee.
        </p>
      )}
    </section>
  );
}
