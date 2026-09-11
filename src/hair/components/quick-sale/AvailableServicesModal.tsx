'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { listAvailablePackageServicesAction } from '@/src/hair/actions/packages';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export type AvailableServiceSelection = {
  creditId: string;
  customerPackageId: string;
  serviceId: string;
  serviceName: string;
  packageName: string;
  quantity: number;
  effectiveUnitValuePaise: number;
  remaining: number;
};

type CreditRow = {
  creditId: string;
  customerPackageId: string;
  packageName: string;
  serviceId: string;
  serviceName: string;
  remaining: number;
  effectiveUnitValuePaise: number;
};

type Props = {
  customerId: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (selections: AvailableServiceSelection[]) => void;
};

export function AvailableServicesModal({ customerId, open, onClose, onConfirm }: Props) {
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [qtyByCredit, setQtyByCredit] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !customerId) return;
    startTransition(async () => {
      setError(null);
      setValidationError(null);
      const res = await listAvailablePackageServicesAction(customerId);
      if (res.error) {
        setError(res.error);
        setCredits([]);
        setQtyByCredit({});
        return;
      }
      setCredits(res.credits);
      setQtyByCredit({});
    });
  }, [open, customerId]);

  const grouped = useMemo(() => {
    const map = new Map<string, CreditRow[]>();
    for (const row of credits) {
      const key = row.packageName || 'Package';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [credits]);

  if (!open) return null;

  const setQty = (creditId: string, remaining: number, next: number) => {
    const clamped = Math.max(0, Math.min(remaining, Math.floor(next)));
    setQtyByCredit((prev) => {
      if (clamped <= 0) {
        const { [creditId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [creditId]: clamped };
    });
    setValidationError(null);
  };

  const confirm = () => {
    const selections: AvailableServiceSelection[] = [];
    for (const row of credits) {
      const quantity = qtyByCredit[row.creditId] ?? 0;
      if (quantity <= 0) continue;
      selections.push({
        creditId: row.creditId,
        customerPackageId: row.customerPackageId,
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        packageName: row.packageName,
        quantity,
        effectiveUnitValuePaise: row.effectiveUnitValuePaise,
        remaining: row.remaining,
      });
    }
    if (selections.length === 0) {
      setValidationError('Select at least one prepaid service to redeem');
      return;
    }
    onConfirm(selections);
    onClose();
  };

  const hasSelections = Object.values(qtyByCredit).some((qty) => qty > 0);

  return (
    <div
      className="fyh-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fyh-modal-panel sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="available-services-title"
      >
        <header className="fyh-modal-header flex items-center justify-between gap-2">
          <h2 id="available-services-title" className="fyh-modal-title">
            Available Services
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="fyh-modal-body space-y-4">
          {error ? <p className="fyh-alert-danger-box text-sm">{error}</p> : null}
          {validationError ? <p className="fyh-alert-danger-box text-sm">{validationError}</p> : null}
          {pending && credits.length === 0 && !error ? (
            <p className="text-sm text-fyh-text-muted">Loading prepaid services…</p>
          ) : null}
          {!pending && credits.length === 0 && !error ? (
            <p className="text-sm text-fyh-text-muted">No prepaid package services available.</p>
          ) : null}
          {grouped.map(([packageName, rows]) => (
            <section key={packageName} className="space-y-2">
              <h3 className="text-sm font-semibold text-fyh-text">{packageName}</h3>
              <ul className="divide-y divide-[color:var(--fyh-border)] rounded-lg border border-[color:var(--fyh-border)]">
                {rows.map((row) => {
                  const qty = qtyByCredit[row.creditId] ?? 0;
                  return (
                    <li key={row.creditId} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fyh-text">{row.serviceName}</p>
                          <p className="text-xs text-fyh-text-muted">
                            {row.remaining} available · {formatInrFromPaise(row.effectiveUnitValuePaise)}{' '}
                            perf/unit
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 w-8 px-0"
                            disabled={qty <= 0}
                            onClick={() => setQty(row.creditId, row.remaining, qty - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </Button>
                          <span className="w-8 text-center tabular-nums text-sm font-semibold">{qty}</span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 w-8 px-0"
                            disabled={qty >= row.remaining}
                            onClick={() => setQty(row.creditId, row.remaining, qty + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <footer className="fyh-modal-footer flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={pending || !hasSelections}>
            Add to basket
          </Button>
        </footer>
      </div>
    </div>
  );
}
