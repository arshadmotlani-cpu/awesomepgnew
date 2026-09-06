'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import {
  createPackagePlanAction,
  listPackagePlansAction,
  listServicesForPackageAction,
  type PackageActionState,
} from '@/src/hair/actions/packages';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  computePackageDiscount,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { PackagePlanDetailed } from '@/src/hair/services/packagePlans';

type ServiceOption = { id: string; name: string; pricePaise: number };
type DraftItem = { key: string; serviceId: string; quantity: number };

const emptyCreate: PackageActionState = {};

function validityLabel(days: number | null): string {
  if (days == null) return 'Forever';
  return `${days} days`;
}

export function PackagesUi() {
  const [plans, setPlans] = useState<PackagePlanDetailed[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, createPending] = useActionState(createPackagePlanAction, emptyCreate);

  const [name, setName] = useState('');
  const [forever, setForever] = useState(true);
  const [validityDays, setValidityDays] = useState('90');
  const [offerRupees, setOfferRupees] = useState('');
  const [items, setItems] = useState<DraftItem[]>([
    { key: 'item-1', serviceId: '', quantity: 1 },
  ]);

  const refresh = () => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const [nextPlans, nextServices] = await Promise.all([
          listPackagePlansAction(),
          listServicesForPackageAction(),
        ]);
        setPlans(nextPlans);
        setServices(nextServices);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load packages');
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (createState.success) {
      setName('');
      setForever(true);
      setValidityDays('90');
      setOfferRupees('');
      setItems([{ key: `item-${Date.now()}`, serviceId: '', quantity: 1 }]);
      refresh();
    }
  }, [createState.success]);

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const liveEconomics = useMemo(() => {
    const priced = items
      .filter((i) => i.serviceId && i.quantity > 0)
      .map((i) => ({
        retailUnitPaise: serviceById.get(i.serviceId)?.pricePaise ?? 0,
        quantity: i.quantity,
      }));
    const normalValuePaise = computePackageNormalValuePaise(priced);
    const offerPricePaise = Math.round(Math.max(0, Number(offerRupees) || 0) * 100);
    return {
      normalValuePaise,
      offerPricePaise,
      ...computePackageDiscount(normalValuePaise, offerPricePaise),
    };
  }, [items, offerRupees, serviceById]);

  return (
    <div className="space-y-8">
      <div>
        <p className="fyh-section-eyebrow">Configuration</p>
        <h1 className="fyh-display mt-1 font-semibold">Packages</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Prepaid service credits sold at an offer price. Purchase creates credits; redemption is ₹0
          cash with staff performance at effective package value.
        </p>
      </div>

      {loadError ? <p className="fyh-alert-danger-box text-sm">{loadError}</p> : null}

      <section className="fyh-panel space-y-4 !p-4">
        <h2 className="text-base font-semibold text-fyh-on-panel">Create package</h2>
        <form action={createAction} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="fyh-label">Name</span>
              <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="fyh-label">Offer price (₹)</span>
              <Input
                name="offerPriceRupees"
                inputMode="decimal"
                value={offerRupees}
                onChange={(e) => setOfferRupees(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-fyh-text">
              <input
                type="checkbox"
                name="forever"
                checked={forever}
                onChange={(e) => setForever(e.target.checked)}
              />
              Forever validity
            </label>
            {!forever ? (
              <label className="space-y-1 text-sm">
                <span className="fyh-label">Validity (days)</span>
                <Input
                  name="validityDays"
                  inputMode="numeric"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="w-28"
                />
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="fyh-label">Services</p>
            {items.map((item, idx) => (
              <div key={item.key} className="flex flex-wrap items-center gap-2">
                <select
                  name="serviceId"
                  className="h-10 min-w-[14rem] flex-1 rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-3 text-sm"
                  value={item.serviceId}
                  onChange={(e) => {
                    const serviceId = e.target.value;
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, serviceId } : row)),
                    );
                  }}
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {formatInrFromPaise(s.pricePaise)}
                    </option>
                  ))}
                </select>
                <Input
                  name="quantity"
                  inputMode="numeric"
                  className="w-20"
                  value={String(item.quantity)}
                  onChange={(e) => {
                    const quantity = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity } : row)),
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={items.length <= 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { key: `item-${Date.now()}`, serviceId: '', quantity: 1 },
                ])
              }
            >
              Add service
            </Button>
          </div>

          <div className="grid gap-2 rounded-lg border border-[color:var(--fyh-border)] px-3 py-2 text-sm md:grid-cols-3">
            <div>
              <p className="text-fyh-text-muted">Normal value</p>
              <p className="font-semibold tabular-nums">
                {formatInrFromPaise(liveEconomics.normalValuePaise)}
              </p>
            </div>
            <div>
              <p className="text-fyh-text-muted">Discount</p>
              <p className="font-semibold tabular-nums">
                {liveEconomics.discountPercentDisplay.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-fyh-text-muted">You save</p>
              <p className="font-semibold tabular-nums text-fyh-accent">
                {formatInrFromPaise(liveEconomics.discountAmountPaise)}
              </p>
            </div>
          </div>

          {createState.error ? (
            <p className="text-sm text-fyh-danger">{createState.error}</p>
          ) : null}
          {createState.success ? (
            <p className="text-sm text-fyh-accent">{createState.success}</p>
          ) : null}

          <Button type="submit" disabled={createPending}>
            {createPending ? 'Creating…' : 'Create package'}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Package catalog</h2>
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={pending}>
            Refresh
          </Button>
        </div>

        {plans.length === 0 ? (
          <div className="fyh-glass px-6 py-12 text-center">
            <p className="fyh-display text-xl font-semibold">No packages yet</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              Create a prepaid package above to sell it from Express Sale.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--fyh-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[color:var(--fyh-surface-muted)] text-fyh-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Package</th>
                  <th className="px-4 py-3 font-medium">Services</th>
                  <th className="px-4 py-3 font-medium">Normal value</th>
                  <th className="px-4 py-3 font-medium">Offer</th>
                  <th className="px-4 py-3 font-medium">Discount</th>
                  <th className="px-4 py-3 font-medium">Validity</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((pkg) => (
                  <tr
                    key={pkg.id}
                    className="border-t border-[color:var(--fyh-border)] text-fyh-text"
                  >
                    <td className="px-4 py-3 font-medium">{pkg.name}</td>
                    <td className="px-4 py-3 text-fyh-text-secondary">
                      {pkg.items.length === 0
                        ? '—'
                        : pkg.items
                            .map((i) => `${i.serviceName} × ${i.quantity}`)
                            .join(', ')}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatInrFromPaise(pkg.normalValuePaise)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {formatInrFromPaise(pkg.offerPricePaise)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {pkg.discountPercentDisplay.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">{validityLabel(pkg.validityDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
