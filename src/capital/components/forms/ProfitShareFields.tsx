'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatInr } from '@/src/capital/lib/money';
import { cn } from '@/src/capital/lib/utils';

const selectClass =
  'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-ac-text';

export type ProfitShareFieldValues = {
  shareMode: 'percentage' | 'fixed';
  partnerPct: number;
  myPct: number;
  partnerFixed: number;
  myFixed: number;
};

/**
 * Reusable profit-distribution fields for sale / manual profit forms.
 * Uses native form fields (name=) so server actions / FormData work.
 */
export function ProfitShareFields({
  grossRupees,
  defaultPartnerPct = 40,
  className,
}: {
  /** Live gross profit in rupees (can be negative for losses) */
  grossRupees: number;
  defaultPartnerPct?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<'percentage' | 'fixed'>('percentage');
  const [partnerPct, setPartnerPct] = useState(defaultPartnerPct);
  const [myPct, setMyPct] = useState(100 - defaultPartnerPct);
  const [partnerFixed, setPartnerFixed] = useState(0);

  const grossPaise = Math.round(grossRupees * 100);

  const preview = useMemo(() => {
    if (mode === 'percentage') {
      const partner = Math.round((grossPaise * partnerPct) / 100);
      return { partner, mine: grossPaise - partner };
    }
    const partner = Math.round(partnerFixed * 100);
    return { partner, mine: grossPaise - partner };
  }, [mode, partnerPct, partnerFixed, grossPaise]);

  useEffect(() => {
    setMyPct(100 - partnerPct);
  }, [partnerPct]);

  return (
    <div className={cn('space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Profit distribution</p>
        <p className="text-xs text-ac-text-muted">
          Gross {formatInr(grossPaise)}
        </p>
      </div>

      <input type="hidden" name="shareMode" value={mode} />

      <div className="flex gap-1.5">
        {(['percentage', 'fixed'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition',
              mode === m
                ? 'bg-ac-accent/20 text-ac-accent ring-1 ring-ac-accent/40'
                : 'bg-white/5 text-ac-text-secondary hover:bg-white/10',
            )}
          >
            {m === 'percentage' ? 'Percentage split' : 'Fixed amount'}
          </button>
        ))}
      </div>

      {mode === 'percentage' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">Partner %</label>
            <input
              type="number"
              name="partnerPct"
              min={0}
              max={100}
              step={1}
              value={partnerPct}
              onChange={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                setPartnerPct(v);
              }}
              className={selectClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">My %</label>
            <input
              type="number"
              name="myPct"
              min={0}
              max={100}
              step={1}
              value={myPct}
              onChange={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                setMyPct(v);
                setPartnerPct(100 - v);
              }}
              className={selectClass}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">Partner receives (₹)</label>
            <input
              type="number"
              name="partnerFixed"
              min={0}
              step={0.01}
              value={partnerFixed}
              onChange={(e) => setPartnerFixed(Number(e.target.value) || 0)}
              className={selectClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">I receive (₹)</label>
            <input
              type="number"
              name="myFixed"
              readOnly
              value={(preview.mine / 100).toFixed(2)}
              className={cn(selectClass, 'opacity-80')}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-ac-text-muted">Partner share</p>
          <p className="mt-0.5 font-medium tabular-nums">{formatInr(preview.partner)}</p>
        </div>
        <div className="rounded-lg bg-ac-accent/10 px-3 py-2">
          <p className="text-ac-text-muted">My share</p>
          <p className="mt-0.5 font-medium tabular-nums text-ac-accent">{formatInr(preview.mine)}</p>
        </div>
      </div>
    </div>
  );
}

/** Controlled variant for react-hook-form (manual profit). */
export function ProfitShareFieldsControlled({
  grossRupees,
  mode,
  partnerPct,
  myPct,
  partnerFixed,
  onModeChange,
  onPartnerPctChange,
  onMyPctChange,
  onPartnerFixedChange,
}: {
  grossRupees: number;
  mode: 'percentage' | 'fixed';
  partnerPct: number;
  myPct: number;
  partnerFixed: number;
  onModeChange: (m: 'percentage' | 'fixed') => void;
  onPartnerPctChange: (n: number) => void;
  onMyPctChange: (n: number) => void;
  onPartnerFixedChange: (n: number) => void;
}) {
  const grossPaise = Math.round(grossRupees * 100);
  const preview = useMemo(() => {
    if (mode === 'percentage') {
      const partner = Math.round((grossPaise * partnerPct) / 100);
      return { partner, mine: grossPaise - partner };
    }
    const partner = Math.round(partnerFixed * 100);
    return { partner, mine: grossPaise - partner };
  }, [mode, partnerPct, partnerFixed, grossPaise]);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Profit distribution</p>
        <p className="text-xs text-ac-text-muted">Gross {formatInr(grossPaise)}</p>
      </div>

      <div className="flex gap-1.5">
        {(['percentage', 'fixed'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition',
              mode === m
                ? 'bg-ac-accent/20 text-ac-accent ring-1 ring-ac-accent/40'
                : 'bg-white/5 text-ac-text-secondary hover:bg-white/10',
            )}
          >
            {m === 'percentage' ? 'Percentage split' : 'Fixed amount'}
          </button>
        ))}
      </div>

      {mode === 'percentage' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">Partner %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={partnerPct}
              onChange={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                onPartnerPctChange(v);
                onMyPctChange(100 - v);
              }}
              className={selectClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">My %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={myPct}
              onChange={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                onMyPctChange(v);
                onPartnerPctChange(100 - v);
              }}
              className={selectClass}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">Partner receives (₹)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={partnerFixed}
              onChange={(e) => onPartnerFixedChange(Number(e.target.value) || 0)}
              className={selectClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-secondary">I receive (₹)</label>
            <input
              type="number"
              readOnly
              value={(preview.mine / 100).toFixed(2)}
              className={cn(selectClass, 'opacity-80')}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-ac-text-muted">Partner share</p>
          <p className="mt-0.5 font-medium tabular-nums">{formatInr(preview.partner)}</p>
        </div>
        <div className="rounded-lg bg-ac-accent/10 px-3 py-2">
          <p className="text-ac-text-muted">My share</p>
          <p className="mt-0.5 font-medium tabular-nums text-ac-accent">{formatInr(preview.mine)}</p>
        </div>
      </div>
    </div>
  );
}
