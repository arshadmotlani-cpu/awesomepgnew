'use client';

import { useEffect, useState } from 'react';
import {
  getResidentQuickContextAction,
  type ResidentQuickContext,
} from '@/app/(admin)/admin/quick-actions/actions';
import { paiseToInr } from '@/src/lib/format';
import {
  ResidentQuickSearch,
  type ResidentQuickResult,
} from '@/src/components/admin/quickActions/ResidentQuickSearch';

export function useResidentQuickContext(selected: ResidentQuickResult | null) {
  const [ctx, setCtx] = useState<ResidentQuickContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) {
      setCtx(null);
      return;
    }
    setLoading(true);
    void getResidentQuickContextAction(selected.id).then((result) => {
      if ('error' in result) {
        setCtx(null);
      } else {
        setCtx(result);
      }
      setLoading(false);
    });
  }, [selected]);

  return { ctx, loading };
}

export function QuickActionResidentStep({
  selected,
  onSelect,
  children,
}: {
  selected: ResidentQuickResult | null;
  onSelect: (row: ResidentQuickResult | null) => void;
  children: (args: {
    selected: ResidentQuickResult;
    ctx: ResidentQuickContext | null;
    loading: boolean;
  }) => React.ReactNode;
}) {
  const { ctx, loading } = useResidentQuickContext(selected);

  return (
    <div className="space-y-4">
      <ResidentQuickSearch selected={selected} onSelect={onSelect} />
      {selected ? (
        <>
          {loading ? <p className="text-xs text-apg-silver">Loading resident context…</p> : null}
          {ctx && !loading ? (
            <div className="rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-[11px] text-apg-silver">
              {ctx.monthlyRentPaise > 0 ? (
                <p>
                  Monthly rent: <span className="text-white">{paiseToInr(ctx.monthlyRentPaise)}</span>
                </p>
              ) : null}
              {ctx.depositCollectedPaise > 0 || ctx.depositRefundablePaise > 0 ? (
                <p>
                  Deposit: collected {paiseToInr(ctx.depositCollectedPaise)} · refundable{' '}
                  <span className="text-emerald-300">{paiseToInr(ctx.depositRefundablePaise)}</span>
                  {ctx.depositDeductedPaise > 0
                    ? ` · deducted ${paiseToInr(ctx.depositDeductedPaise)}`
                    : null}
                </p>
              ) : null}
              {ctx.vacatingPenaltyEstimatePaise > 0 ? (
                <p>Est. vacating penalty: {paiseToInr(ctx.vacatingPenaltyEstimatePaise)}</p>
              ) : null}
            </div>
          ) : null}
          <div className="border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-medium text-apg-silver">Step 2 — Action details</p>
            {children({ selected, ctx, loading })}
          </div>
        </>
      ) : null}
    </div>
  );
}
