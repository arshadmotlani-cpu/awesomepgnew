'use client';

import { useState } from 'react';
import { PROPERTY_INCOME_SOURCE_TYPES } from '@/src/owner/lib/wealth/propertyIncomeTypes';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

export type DraftIncomeSource = {
  sourceType: string;
  name: string;
  tenantName?: string;
  monthlyAmountRupees: number;
  securityDepositRupees?: number;
  startDate?: string;
  status: string;
};

export function PropertyIncomeSourcesEditor({
  linkedPgId,
  onChange,
}: {
  linkedPgId?: string;
  onChange: (sources: DraftIncomeSource[], json: string) => void;
}) {
  const [sources, setSources] = useState<DraftIncomeSource[]>([]);
  const [draft, setDraft] = useState<DraftIncomeSource>({
    sourceType: 'SHOP',
    name: '',
    tenantName: '',
    monthlyAmountRupees: 0,
    status: 'ACTIVE',
    startDate: new Date().toISOString().slice(0, 10),
  });

  const pushSources = (next: DraftIncomeSource[]) => {
    setSources(next);
    onChange(next, JSON.stringify(next));
  };

  const addSource = () => {
    if (!draft.name.trim()) return;
    if (draft.sourceType === 'PG' && linkedPgId) return;
    const next = [...sources, { ...draft, name: draft.name.trim() }];
    pushSources(next);
    setDraft({
      sourceType: 'SHOP',
      name: '',
      tenantName: '',
      monthlyAmountRupees: 0,
      status: 'ACTIVE',
      startDate: new Date().toISOString().slice(0, 10),
    });
  };

  const removeAt = (idx: number) => {
    pushSources(sources.filter((_, i) => i !== idx));
  };

  const totalMonthly = sources.reduce((s, x) => s + x.monthlyAmountRupees, 0);

  return (
    <section className="oo-form-section">
      <h2 className="oo-form-section-title">Property income sources</h2>
      {linkedPgId ? (
        <p className="oo-form-hint mb-3">
          Awesome PG income will sync automatically when linked — add shops, offices, and other
          tenants below.
        </p>
      ) : null}

      {sources.length > 0 ? (
        <div className="mb-4 space-y-2">
          {sources.map((s, i) => (
            <div key={i} className="oo-card flex items-center justify-between px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{s.name}</p>
                <p className="oo-meta text-xs">
                  {s.sourceType} · <AmountWithWords paise={s.monthlyAmountRupees * 100} /> / month · {s.status}
                </p>
              </div>
              <button type="button" onClick={() => removeAt(i)} className="text-xs text-red-400">
                Remove
              </button>
            </div>
          ))}
          <p className="oo-meta">
            Gross monthly (sources): <AmountWithWords paise={totalMonthly * 100} />
          </p>
        </div>
      ) : (
        <p className="oo-meta mb-3">No income sources yet.</p>
      )}

      <div className="oo-form-grid border-t border-white/10 pt-4">
        <div className="oo-form-field">
          <label className="oo-form-label">Type</label>
          <select
            className="oo-form-input"
            value={draft.sourceType}
            onChange={(e) => setDraft({ ...draft, sourceType: e.target.value })}
          >
            {PROPERTY_INCOME_SOURCE_TYPES.filter((t) =>
              linkedPgId ? t.value !== 'PG' : true,
            ).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="oo-form-field">
          <label className="oo-form-label">Name / unit</label>
          <input
            className="oo-form-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Shop 1"
          />
        </div>
        <div className="oo-form-field">
          <label className="oo-form-label">Tenant (optional)</label>
          <input
            className="oo-form-input"
            value={draft.tenantName ?? ''}
            onChange={(e) => setDraft({ ...draft, tenantName: e.target.value })}
          />
        </div>
        <div className="oo-form-field">
          <label className="oo-form-label">Monthly rent (₹)</label>
          <input
            type="number"
            min={0}
            className="oo-form-input"
            value={draft.monthlyAmountRupees || ''}
            onChange={(e) =>
              setDraft({ ...draft, monthlyAmountRupees: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="oo-form-field">
          <label className="oo-form-label">Start date</label>
          <input
            type="date"
            className="oo-form-input oo-form-input-date"
            value={draft.startDate ?? ''}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
          />
        </div>
        <button type="button" onClick={addSource} className="oo-btn-secondary">
          + Add income source
        </button>
      </div>
    </section>
  );
}
