'use client';

import { useActionState, useMemo, useState } from 'react';
import { recordSaleAction, updateStatusAction, type ActionState } from '@/src/capital/actions/assets';
import { createSettlementAction } from '@/src/capital/actions/settlements';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { assetStatusEnum } from '@/src/capital/db/schema/enums';
import { distributeDealProfits } from '@/src/capital/lib/dealEconomics';
import type { InvestorSlot } from '@/src/capital/db/schema/investors';

const initialState: ActionState = {};

const MUTABLE_STATUSES = assetStatusEnum.enumValues.filter(
  (s) => s !== 'cancelled' && s !== 'settled' && s !== 'sold',
);

export function AssetActionsForms({
  assetId,
  currentStatus,
  totalInvestmentPaise = 0,
  fundingGapPaise = 0,
  operatingPartnerNumerator = 1,
  operatingPartnerDenominator = 2,
  investors = [],
}: {
  assetId: string;
  currentStatus: string;
  totalInvestmentPaise?: number;
  fundingGapPaise?: number;
  operatingPartnerNumerator?: number;
  operatingPartnerDenominator?: number;
  investors?: { slot: string; label: string; investedPaise: number }[];
}) {
  const isClosed =
    currentStatus === 'sold' || currentStatus === 'settled' || currentStatus === 'cancelled';
  const isSettledOrCancelled = currentStatus === 'settled' || currentStatus === 'cancelled';

  return (
    <div className="space-y-4">
      {isClosed ? (
        <div className="rounded-xl border border-ac-warning/30 bg-ac-warning/10 px-4 py-3 text-sm text-ac-warning">
          This vehicle is <strong>{currentStatus}</strong> and read-only for new costs.
          {currentStatus === 'sold'
            ? ' Record capital return & profit under Payments, then settle.'
            : ' History remains available.'}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {!isClosed ? (
          <StatusForm assetId={assetId} currentStatus={currentStatus} />
        ) : null}
        {!isClosed ? (
          <SaleForm
            assetId={assetId}
            totalInvestmentPaise={totalInvestmentPaise}
            fundingGapPaise={fundingGapPaise}
            operatingPartnerNumerator={operatingPartnerNumerator}
            operatingPartnerDenominator={operatingPartnerDenominator}
            investors={investors}
          />
        ) : null}
        {currentStatus === 'sold' ? <SettlementForm assetId={assetId} /> : null}
        {isSettledOrCancelled ? (
          <p className="text-sm text-ac-text-muted md:col-span-2">
            No further actions — view timeline, expenses, and ledger history below.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusForm({ assetId, currentStatus }: { assetId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState(updateStatusAction, initialState);

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <h3 className="font-medium">Update status</h3>
      <input type="hidden" name="assetId" value={assetId} />
      <select
        name="status"
        defaultValue={currentStatus}
        className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
      >
        {MUTABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Update
      </Button>
    </form>
  );
}

function SaleForm({
  assetId,
  totalInvestmentPaise,
  fundingGapPaise,
  operatingPartnerNumerator,
  operatingPartnerDenominator,
  investors,
}: {
  assetId: string;
  totalInvestmentPaise: number;
  fundingGapPaise: number;
  operatingPartnerNumerator: number;
  operatingPartnerDenominator: number;
  investors: { slot: string; label: string; investedPaise: number }[];
}) {
  const [state, formAction, pending] = useActionState(recordSaleAction, initialState);
  const [salePrice, setSalePrice] = useState('');
  const fullyFunded = fundingGapPaise === 0;

  const preview = useMemo(() => {
    const price = Math.round((Number(salePrice) || 0) * 100);
    if (!salePrice || price <= 0) return null;
    const businessProfit = price - totalInvestmentPaise;
    try {
      const deal = distributeDealProfits({
        businessProfitPaise: businessProfit,
        netVehicleCostPaise: totalInvestmentPaise,
        settings: {
          numerator: operatingPartnerNumerator,
          denominator: operatingPartnerDenominator,
        },
        funding: investors.map((i) => ({
          slot: i.slot as InvestorSlot,
          investedPaise: i.investedPaise,
          label: i.label,
        })),
      });
      return deal;
    } catch {
      return null;
    }
  }, [
    salePrice,
    totalInvestmentPaise,
    operatingPartnerNumerator,
    operatingPartnerDenominator,
    investors,
  ]);

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4 md:col-span-2 lg:col-span-1">
      <h3 className="font-medium">Record sale</h3>
      <p className="text-xs text-ac-text-muted">
        Enter sale price and date only. Profits and ROI are calculated automatically.
      </p>
      {!fullyFunded ? (
        <p className="rounded-lg border border-ac-danger/30 bg-ac-danger/10 px-3 py-2 text-sm text-ac-danger">
          Funding must equal net vehicle cost before sale. Update investments first
          {fundingGapPaise > 0
            ? ` (underfunded by ₹${(fundingGapPaise / 100).toLocaleString('en-IN')})`
            : ` (overfunded by ₹${(Math.abs(fundingGapPaise) / 100).toLocaleString('en-IN')})`}
          .
        </p>
      ) : null}
      <input type="hidden" name="assetId" value={assetId} />
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale price (₹)</label>
        <Input
          name="salePrice"
          type="number"
          required
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          disabled={!fullyFunded}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale date</label>
        <Input name="saleDate" type="date" required disabled={!fullyFunded} />
      </div>
      {preview ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Net vehicle cost</span>
            <MoneyDisplay paise={totalInvestmentPaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Business profit</span>
            <MoneyDisplay paise={preview.businessProfitPaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-secondary">
              Sufii (operating partner){' '}
              <span className="text-ac-text-muted">
                ({(preview.operatingPartnerPctBps / 100).toFixed(0)}%)
              </span>
            </span>
            <MoneyDisplay paise={preview.operatingPartnerSharePaise} />
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Investor pool</span>
            <MoneyDisplay paise={preview.investorPoolPaise} />
          </div>
          {preview.investors.map((p) => (
            <div key={p.slot} className="flex justify-between gap-2 pl-2">
              <span className="text-ac-text-secondary">
                {p.label}{' '}
                <span className="text-ac-text-muted">
                  (
                  {totalInvestmentPaise > 0
                    ? ((p.investedPaise / totalInvestmentPaise) * 100).toFixed(0)
                    : 0}
                  %)
                </span>
              </span>
              <MoneyDisplay paise={p.profitPaise ?? 0} />
            </div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-ac-text-muted">Business ROI</span>
            <span>
              {preview.businessRoiBps != null
                ? `${(preview.businessRoiBps / 100).toFixed(1)}%`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ac-text-muted">My ROI</span>
            <span>
              {preview.myRoiBps != null ? `${(preview.myRoiBps / 100).toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" disabled={pending || !fullyFunded}>
        Record sale
      </Button>
    </form>
  );
}

function SettlementForm({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(createSettlementAction, initialState);

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4">
      <h3 className="font-medium">Mark settled</h3>
      <input type="hidden" name="assetId" value={assetId} />
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Notes (optional)</label>
        <Input name="notes" aria-label="Settlement notes" />
      </div>
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        Settle
      </Button>
    </form>
  );
}
