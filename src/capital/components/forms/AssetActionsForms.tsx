'use client';

import { useActionState, useMemo, useState } from 'react';
import { recordSaleAction, updateStatusAction, type ActionState } from '@/src/capital/actions/assets';
import { createSettlementAction } from '@/src/capital/actions/settlements';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { assetStatusEnum } from '@/src/capital/db/schema/enums';

const initialState: ActionState = {};

const MUTABLE_STATUSES = assetStatusEnum.enumValues.filter(
  (s) => s !== 'cancelled' && s !== 'settled' && s !== 'sold',
);

export function AssetActionsForms({
  assetId,
  currentStatus,
  totalInvestmentPaise = 0,
  investors = [],
}: {
  assetId: string;
  currentStatus: string;
  totalInvestmentPaise?: number;
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
  investors,
}: {
  assetId: string;
  totalInvestmentPaise: number;
  investors: { slot: string; label: string; investedPaise: number }[];
}) {
  const [state, formAction, pending] = useActionState(recordSaleAction, initialState);
  const [salePrice, setSalePrice] = useState('');
  const grossPaise = useMemo(() => {
    const price = Math.round((Number(salePrice) || 0) * 100);
    return price - totalInvestmentPaise;
  }, [salePrice, totalInvestmentPaise]);

  const totalInvested = investors.reduce((s, i) => s + i.investedPaise, 0) || 1;
  const preview = investors
    .filter((i) => i.investedPaise > 0 || i.slot === 'me')
    .map((i) => ({
      ...i,
      profitPaise: Math.round((grossPaise * i.investedPaise) / totalInvested),
    }));

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4 md:col-span-2 lg:col-span-1">
      <h3 className="font-medium">Record sale</h3>
      <p className="text-xs text-ac-text-muted">
        Business profit is split in proportion to each investor&apos;s capital.
      </p>
      <input type="hidden" name="assetId" value={assetId} />
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale price (₹)</label>
        <Input
          name="salePrice"
          type="number"
          required
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ac-text-secondary">Sale date</label>
        <Input name="saleDate" type="date" required />
      </div>
      {salePrice ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ac-text-muted">Business profit</span>
            <MoneyDisplay paise={grossPaise} />
          </div>
          {preview.map((p) => (
            <div key={p.slot} className="flex justify-between gap-2">
              <span className="text-ac-text-secondary">
                {p.label}{' '}
                <span className="text-ac-text-muted">
                  ({((p.investedPaise / totalInvested) * 100).toFixed(0)}%)
                </span>
              </span>
              <MoneyDisplay paise={p.profitPaise} />
            </div>
          ))}
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
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
