'use client';

import { useActionState, useMemo, useState } from 'react';
import { recordSaleAction, updateStatusAction, type ActionState } from '@/src/capital/actions/assets';
import { createSettlementAction } from '@/src/capital/actions/settlements';
import { ProfitShareFields } from '@/src/capital/components/forms/ProfitShareFields';
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
}: {
  assetId: string;
  currentStatus: string;
  totalInvestmentPaise?: number;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <StatusForm assetId={assetId} currentStatus={currentStatus} />
      <SaleForm assetId={assetId} totalInvestmentPaise={totalInvestmentPaise} />
      {currentStatus === 'sold' ? <SettlementForm assetId={assetId} /> : null}
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
}: {
  assetId: string;
  totalInvestmentPaise: number;
}) {
  const [state, formAction, pending] = useActionState(recordSaleAction, initialState);
  const [salePrice, setSalePrice] = useState('');
  const grossRupees = useMemo(() => {
    const price = Number(salePrice) || 0;
    return price - totalInvestmentPaise / 100;
  }, [salePrice, totalInvestmentPaise]);

  return (
    <form action={formAction} className="ac-glass-card space-y-3 p-4 md:col-span-2 lg:col-span-1">
      <h3 className="font-medium">Record sale</h3>
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
      <ProfitShareFields grossRupees={grossRupees} defaultPartnerPct={40} />
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
      <Button type="submit" size="sm" variant="default" disabled={pending}>
        Settle asset
      </Button>
    </form>
  );
}
