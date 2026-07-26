'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { recordSaleAction, type ActionState } from '@/src/capital/actions/assets';
import { createSettlementAction } from '@/src/capital/actions/settlements';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { ProfitDistributionForm } from '@/src/capital/components/forms/ProfitDistributionForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import {
  computeGrossDealProfit,
  distributeDealProfits,
  type ProfitDistributionMode,
} from '@/src/capital/lib/dealEconomics';
import { fullSelfFunding } from '@/src/capital/lib/investors';
import { lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';

const initialState: ActionState = {};

export function AssetActionsForms({
  assetId,
  currentStatus,
  purchasePricePaise = 0,
  totalInvestmentPaise = 0,
  profitDistributionMode = null,
}: {
  assetId: string;
  currentStatus: string;
  purchasePricePaise?: number;
  totalInvestmentPaise?: number;
  /** Set when sale was recorded; null while unsold. */
  profitDistributionMode?: ProfitDistributionMode | null;
}) {
  const isClosed =
    currentStatus === 'sold' || currentStatus === 'settled' || currentStatus === 'cancelled';
  const isSettledOrCancelled = currentStatus === 'settled' || currentStatus === 'cancelled';
  const hasSale = currentStatus === 'sold' || currentStatus === 'settled';

  return (
    <div className="space-y-4">
      {isClosed ? (
        <div className="rounded-xl border border-ac-warning/30 bg-ac-warning/10 px-4 py-3 text-sm text-ac-warning">
          This vehicle is <strong>{lifecycleLabel(currentStatus)}</strong> and read-only for new
          costs.
          {currentStatus === 'sold'
            ? ' Close the deal with Settle when the sale is complete.'
            : ' History remains available.'}
        </div>
      ) : (
        <p className="text-sm text-ac-text-muted">
          Lifecycle is managed on Overview. Use this tab to record a sale and choose how profit is
          split.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {!isClosed ? (
          <SaleForm
            assetId={assetId}
            purchasePricePaise={purchasePricePaise}
            totalInvestmentPaise={totalInvestmentPaise}
          />
        ) : null}
        {hasSale && profitDistributionMode ? (
          <ProfitDistributionForm assetId={assetId} mode={profitDistributionMode} />
        ) : null}
        {currentStatus === 'sold' ? <SettlementForm assetId={assetId} /> : null}
        {isSettledOrCancelled ? (
          <p className="text-sm text-ac-text-muted md:col-span-2">
            No further actions — view timeline and history. You can still change profit distribution
            above; figures recalculate automatically.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SaleForm({
  assetId,
  purchasePricePaise,
  totalInvestmentPaise,
}: {
  assetId: string;
  purchasePricePaise: number;
  totalInvestmentPaise: number;
}) {
  const [state, formAction, pending] = useActionState(recordSaleAction, initialState);
  const [salePrice, setSalePrice] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState<ProfitDistributionMode>('SELF');
  const refreshCapitalView = useRefreshCapitalView();
  const canSell = purchasePricePaise > 0;

  useEffect(() => {
    if (state.success) refreshCapitalView();
  }, [state.success, refreshCapitalView]);

  const preview = useMemo(() => {
    const price = Math.round((salePrice || 0) * 100);
    if (!salePrice || price <= 0 || purchasePricePaise <= 0) return null;
    const businessProfit = computeGrossDealProfit(price, totalInvestmentPaise);
    try {
      return distributeDealProfits({
        businessProfitPaise: businessProfit,
        netVehicleCostPaise: totalInvestmentPaise,
        profitDistributionMode: mode,
        funding: fullSelfFunding(purchasePricePaise),
      });
    } catch {
      return null;
    }
  }, [salePrice, totalInvestmentPaise, mode, purchasePricePaise]);

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4 md:col-span-2 lg:col-span-1">
      <h3 className="font-medium">Record sale</h3>
      <p className="text-xs text-ac-text-muted">
        Choose profit distribution when the deal closes — not at purchase.
      </p>
      {!canSell ? (
        <p className="rounded-lg border border-ac-danger/30 bg-ac-danger/10 px-3 py-2 text-sm text-ac-danger">
          Set purchase price before recording a sale.
        </p>
      ) : null}
      <input type="hidden" name="assetId" value={assetId} />
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale price (₹)</label>
        <CurrencyInput
          name="salePrice"
          allowNegative={false}
          value={salePrice ?? ''}
          onValueChange={setSalePrice}
          required
          disabled={!canSell}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale date</label>
        <Input name="saleDate" type="date" required disabled={!canSell} />
      </div>
      <fieldset className="space-y-2" disabled={!canSell}>
        <legend className="mb-1 text-sm text-ac-text-secondary">Profit Distribution</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="profitDistributionMode"
            value="SELF"
            checked={mode === 'SELF'}
            onChange={() => setMode('SELF')}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-ac-text">Entire profit is mine</span>
            <span className="mt-0.5 block text-xs text-ac-text-muted">
              Sufii earns only via broker / transport / repair activities.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="profitDistributionMode"
            value="PARTNERSHIP_50_50"
            checked={mode === 'PARTNERSHIP_50_50'}
            onChange={() => setMode('PARTNERSHIP_50_50')}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-ac-text">Split profit 50% / 50%</span>
            <span className="mt-0.5 block text-xs text-ac-text-muted">
              Half to you, half to Sufii from Gross Deal Profit.
            </span>
          </span>
        </label>
      </fieldset>
      {preview ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Total Vehicle Investment</span>
            <MoneyDisplay paise={totalInvestmentPaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Gross Deal Profit</span>
            <MoneyDisplay paise={preview.businessProfitPaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-secondary">My Profit</span>
            <MoneyDisplay paise={preview.myProfitPaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-secondary">Sufii Profit</span>
            <MoneyDisplay paise={preview.operatingPartnerSharePaise} />
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-ac-text-muted">My ROI</span>
            <span>
              {preview.myRoiBps != null ? `${(preview.myRoiBps / 100).toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" disabled={pending || !canSell}>
        {pending ? 'Saving…' : 'Record sale'}
      </Button>
    </form>
  );
}

function SettlementForm({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(createSettlementAction, initialState);
  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <h3 className="font-medium">Close deal</h3>
      <p className="text-xs text-ac-text-muted">
        Marks this sold vehicle as settled (deal closed). No capital-return payment is required.
      </p>
      <input type="hidden" name="assetId" value={assetId} />
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Closing…' : 'Close deal'}
      </Button>
    </form>
  );
}
