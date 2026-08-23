'use client';

import { useActionState, useState } from 'react';
import { formatPercent } from '@/src/lib/format';
import {
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
  createPropertyIncomeSourceAction,
  updatePropertyIncomeSourceAction,
  changePropertyIncomeRentAction,
  deletePropertyIncomeSourceAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { PROPERTY_INCOME_SOURCE_TYPES } from '@/src/owner/lib/wealth/propertyIncomeTypes';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

type IncomeSourceRow = {
  id: string;
  name: string;
  sourceType: string;
  tenantName: string | null;
  monthlyAmountPaise: number;
  status: string;
  sourceSystem: string | null;
  isPgSynced: boolean;
  pgIntegrationActualPaise: number;
};

type IncomeTotals = {
  grossMonthlyPaise: number;
  grossAnnualizedPaise: number;
  activeCount: number;
  vacantCount: number;
  byType: Record<string, number>;
  pgIntegrationActualPaise: number;
  sources: IncomeSourceRow[];
};

export function PropertyIncomeSection({
  assetId,
  linkedPgId,
  linkedPgName,
  totals,
  grossRentalYieldPct,
  netRentalYieldPct,
}: {
  assetId: string;
  linkedPgId: string | null;
  linkedPgName: string | null;
  totals: IncomeTotals;
  grossRentalYieldPct: number | null;
  netRentalYieldPct: number | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addState, addAction, addPending] = useActionState<WealthActionState, FormData>(
    createPropertyIncomeSourceAction,
    {},
  );

  const active = totals.sources.filter((s) => s.status === 'ACTIVE');
  const vacantOrInactive = totals.sources.filter((s) => s.status !== 'ACTIVE');

  return (
    <section className="oo-form-section oo-card-cashflow">
      <h2 className="oo-section-heading">Income</h2>
      <div className="mb-4">
        <p className="oo-money-primary oo-value-income"><AmountWithWords paise={totals.grossMonthlyPaise} /> / month</p>
        <p className="oo-meta-bright"><AmountWithWords paise={totals.grossAnnualizedPaise} /> / year (annualized)</p>
        {totals.pgIntegrationActualPaise > 0 ? (
          <p className="oo-meta mt-1">
            PG actual this period: <AmountWithWords paise={totals.pgIntegrationActualPaise} /> (received / synced)
          </p>
        ) : null}
        {grossRentalYieldPct != null ? (
          <p className="oo-meta mt-1">Gross rental yield: {formatPercent(grossRentalYieldPct)}</p>
        ) : null}
        {netRentalYieldPct != null ? (
          <p className="oo-meta">Net rental yield: {formatPercent(netRentalYieldPct)}</p>
        ) : null}
      </div>

      {Object.keys(totals.byType).length > 0 ? (
        <div className="mb-4 space-y-1 border-b border-white/10 pb-3">
          {Object.entries(totals.byType).map(([type, amount]) => (
            <div key={type} className="flex justify-between text-sm">
              <span className="oo-meta-bright">{type.replace(/_/g, ' ')}</span>
              <span className="tabular-nums text-white"><AmountWithWords paise={amount} /> / month</span>
            </div>
          ))}
        </div>
      ) : null}

      {linkedPgId ? (
        <div className="mb-3 flex items-center gap-2">
          <SourceBadge source="AWESOME_PG" />
          <span className="oo-meta-bright">
            Linked to {linkedPgName ?? 'Awesome PG'} — PG income synced automatically
          </span>
        </div>
      ) : null}

      <h3 className="oo-label mb-2">Active income sources ({totals.activeCount})</h3>
      <div className="space-y-2">
        {active.map((s) => (
          <IncomeSourceCard key={s.id} assetId={assetId} source={s} />
        ))}
        {active.length === 0 ? (
          <p className="oo-meta">No active income sources.</p>
        ) : null}
      </div>

      {vacantOrInactive.length > 0 ? (
        <>
          <h3 className="oo-label mb-2 mt-4">Vacant / inactive ({totals.vacantCount + vacantOrInactive.filter(s => s.status === 'INACTIVE').length})</h3>
          <div className="space-y-2">
            {vacantOrInactive.map((s) => (
              <IncomeSourceCard key={s.id} assetId={assetId} source={s} dimmed />
            ))}
          </div>
        </>
      ) : null}

      {!linkedPgId || showAdd ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          {!showAdd ? (
            <button type="button" onClick={() => setShowAdd(true)} className="oo-btn-secondary text-sm">
              + Add income source
            </button>
          ) : (
            <form action={addAction} className="oo-form-grid">
              <input type="hidden" name="assetId" value={assetId} />
              <div className="oo-form-field">
                <label className="oo-form-label">Type</label>
                <select name="sourceType" className="oo-form-input" defaultValue="SHOP">
                  {PROPERTY_INCOME_SOURCE_TYPES.filter((t) =>
                    linkedPgId ? t.value !== 'PG' : true,
                  ).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="oo-form-field">
                <label className="oo-form-label">Name / unit</label>
                <input name="name" required className="oo-form-input" placeholder="Shop 1" />
              </div>
              <div className="oo-form-field">
                <label className="oo-form-label">Tenant (optional)</label>
                <input name="tenantName" className="oo-form-input" />
              </div>
              <MoneyInput name="monthlyAmountRupees" label="Monthly rent (₹)" required />
              <div className="oo-form-field">
                <label className="oo-form-label">Start date</label>
                <input
                  name="startDate"
                  type="date"
                  className="oo-form-input oo-form-input-date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="oo-form-field">
                <label className="oo-form-label">Status</label>
                <select name="status" className="oo-form-input" defaultValue="ACTIVE">
                  <option value="ACTIVE">Active</option>
                  <option value="VACANT">Vacant</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={addPending} className="oo-btn-primary">
                  {addPending ? 'Saving…' : 'Save income source'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="oo-btn-secondary">
                  Cancel
                </button>
              </div>
              {addState.error ? <p className="text-sm text-red-400">{addState.error}</p> : null}
              {addState.success ? <p className="text-sm text-emerald-400">{addState.success}</p> : null}
            </form>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="oo-btn-secondary mt-4 text-sm"
        >
          + Add shop / other income source
        </button>
      )}
    </section>
  );
}

function IncomeSourceCard({
  assetId,
  source,
  dimmed,
}: {
  assetId: string;
  source: IncomeSourceRow;
  dimmed?: boolean;
}) {
  const [editRent, setEditRent] = useState(false);
  const [rentState, rentAction, rentPending] = useActionState<WealthActionState, FormData>(
    changePropertyIncomeRentAction,
    {},
  );
  const [statusState, statusAction, statusPending] = useActionState<WealthActionState, FormData>(
    updatePropertyIncomeSourceAction,
    {},
  );
  const [delState, delAction, delPending] = useActionState<WealthActionState, FormData>(
    deletePropertyIncomeSourceAction,
    {},
  );

  const typeLabel =
    PROPERTY_INCOME_SOURCE_TYPES.find((t) => t.value === source.sourceType)?.label ??
    source.sourceType;

  return (
    <div
      className={`oo-card px-3 py-2.5 ${dimmed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{source.name}</p>
          <p className="oo-meta-bright text-xs">
            {typeLabel}
            {source.tenantName ? ` · ${source.tenantName}` : ''}
            {source.isPgSynced ? ' · synced from PG' : ''}
          </p>
          <p className="oo-meta text-xs capitalize">{source.status}</p>
        </div>
        <p className="oo-money-secondary shrink-0">
          <AmountWithWords paise={source.monthlyAmountPaise} /> / mo
        </p>
      </div>
      {source.isPgSynced && source.pgIntegrationActualPaise > 0 ? (
        <p className="oo-meta mt-1 text-xs">
          PG actual this period: <AmountWithWords paise={source.pgIntegrationActualPaise} />
        </p>
      ) : null}
      {!source.isPgSynced ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {source.status === 'ACTIVE' ? (
            <form action={statusAction} className="inline">
              <input type="hidden" name="id" value={source.id} />
              <input type="hidden" name="assetId" value={assetId} />
              <input type="hidden" name="name" value={source.name} />
              <input type="hidden" name="status" value="VACANT" />
              <button type="submit" disabled={statusPending} className="text-xs text-amber-300">
                Mark vacant
              </button>
            </form>
          ) : (
            <form action={statusAction} className="inline">
              <input type="hidden" name="id" value={source.id} />
              <input type="hidden" name="assetId" value={assetId} />
              <input type="hidden" name="name" value={source.name} />
              <input type="hidden" name="status" value="ACTIVE" />
              <button type="submit" disabled={statusPending} className="text-xs text-emerald-400">
                Reactivate
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setEditRent(!editRent)}
            className="text-xs text-[#FF5A1F]"
          >
            Change rent
          </button>
          <form action={delAction} className="inline">
            <input type="hidden" name="id" value={source.id} />
            <input type="hidden" name="assetId" value={assetId} />
            <button type="submit" disabled={delPending} className="text-xs text-red-400">
              Remove
            </button>
          </form>
        </div>
      ) : null}
      {editRent ? (
        <form action={rentAction} className="mt-2 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="incomeSourceId" value={source.id} />
          <MoneyInput
            name="monthlyAmountRupees"
            label="New monthly rent (₹)"
            defaultValue={source.monthlyAmountPaise / 100}
            required
          />
          <div className="oo-form-field">
            <label className="oo-form-label">Effective from</label>
            <input
              name="effectiveFrom"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="oo-form-input oo-form-input-date"
            />
          </div>
          <button type="submit" disabled={rentPending} className="oo-btn-primary text-sm">
            Save rent change
          </button>
          {rentState.error ? <p className="text-xs text-red-400">{rentState.error}</p> : null}
        </form>
      ) : null}
      {delState.error ? <p className="text-xs text-red-400 mt-1">{delState.error}</p> : null}
    </div>
  );
}
