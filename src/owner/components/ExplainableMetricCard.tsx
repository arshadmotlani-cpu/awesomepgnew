'use client';

import { formatMetricDisplay, isMetricConnected } from '@/src/personalFinance/explain';
import type { ExplainableValue } from '@/src/personalFinance/types';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

export function ExplainableMetricCard({
  value,
  onExplain,
  compact,
}: {
  value: ExplainableValue;
  onExplain: (v: ExplainableValue) => void;
  compact?: boolean;
}) {
  const connected = isMetricConnected(value);
  return (
    <button
      type="button"
      onClick={() => onExplain(value)}
      className={`rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] text-left transition hover:border-[#FF5A1F]/40 focus:outline-none focus:ring-2 focus:ring-[#FF5A1F]/40 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-[color:var(--oo-muted,#9CA3AF)]">
        {value.label}
      </p>
      <p
        className={`mt-1 font-semibold tabular-nums text-white ${
          connected ? 'text-xl' : 'text-sm text-[color:var(--oo-muted,#9CA3AF)]'
        }`}
      >
        {formatMetricDisplay(value)}
      </p>
      <p className="mt-2 text-[10px] text-[color:var(--oo-muted,#9CA3AF)]">
        {connected ? value.engine.replaceAll('_', ' ') : 'Connect later'}
        {value.provisional && connected ? ' · provisional' : ''}
      </p>
    </button>
  );
}

export function ExplainPanel({
  value,
  onClose,
}: {
  value: ExplainableValue;
  onClose: () => void;
}) {
  const connected = isMetricConnected(value);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#12161c] p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[color:var(--oo-muted,#9CA3AF)]">Explain</p>
            <h2 className="text-lg font-semibold text-white">{value.label}</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {formatMetricDisplay(value)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-[color:var(--oo-muted,#9CA3AF)] hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-[color:var(--oo-muted,#9CA3AF)]">Brain</dt>
            <dd className="font-medium text-white">{value.brain.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--oo-muted,#9CA3AF)]">Engine</dt>
            <dd className="font-medium text-white">{value.engine.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--oo-muted,#9CA3AF)]">Source API</dt>
            <dd className="font-mono text-xs text-emerald-300">{value.sourceApi}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--oo-muted,#9CA3AF)]">Calculation</dt>
            <dd className="text-white">{value.calculation}</dd>
          </div>
          {connected && value.lineage.length > 0 ? (
            <div>
              <dt className="text-[color:var(--oo-muted,#9CA3AF)]">Underlying</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {value.lineage.map((l, i) => (
                    <li key={`${l.label}-${i}`} className="flex justify-between gap-3 text-white">
                      <span>{l.label}</span>
                      <span className="tabular-nums text-[color:var(--oo-muted,#9CA3AF)]">
                        {l.paise != null ? <AmountWithWords paise={l.paise} /> : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
