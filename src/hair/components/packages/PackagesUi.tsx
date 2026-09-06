'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import {
  createPackagePlanAction,
  deactivatePackagePlanAction,
  listPackagePlansAction,
  listServicesForPackageAction,
  reactivatePackagePlanAction,
  updatePackagePlanAction,
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

const emptyState: PackageActionState = {};

function validityLabel(days: number | null): string {
  if (days == null) return 'Forever';
  return `${days} days`;
}

function newDraftItem(overrides?: Partial<DraftItem>): DraftItem {
  return {
    key: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serviceId: '',
    quantity: 1,
    ...overrides,
  };
}

function draftFromPlan(plan: PackagePlanDetailed): {
  name: string;
  forever: boolean;
  validityDays: string;
  offerRupees: string;
  items: DraftItem[];
} {
  return {
    name: plan.name,
    forever: plan.validityDays == null,
    validityDays: plan.validityDays != null ? String(plan.validityDays) : '90',
    offerRupees: (plan.offerPricePaise / 100).toFixed(plan.offerPricePaise % 100 === 0 ? 0 : 2),
    items:
      plan.items.length > 0
        ? plan.items.map((item) =>
            newDraftItem({ serviceId: item.serviceId, quantity: item.quantity }),
          )
        : [newDraftItem()],
  };
}

export function PackagesUi() {
  const [plans, setPlans] = useState<PackagePlanDetailed[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PackagePlanDetailed | null>(null);

  const [createState, createAction, createPending] = useActionState(
    createPackagePlanAction,
    emptyState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updatePackagePlanAction,
    emptyState,
  );

  const [name, setName] = useState('');
  const [forever, setForever] = useState(true);
  const [validityDays, setValidityDays] = useState('90');
  const [offerRupees, setOfferRupees] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newDraftItem({ key: 'item-1' })]);

  const refresh = () => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const [nextPlans, nextServices] = await Promise.all([
          listPackagePlansAction({ includeInactive: true }),
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

  const resetCreateForm = () => {
    setEditingPlanId(null);
    setName('');
    setForever(true);
    setValidityDays('90');
    setOfferRupees('');
    setItems([newDraftItem()]);
  };

  useEffect(() => {
    if (createState.success) {
      resetCreateForm();
      setActionMessage(createState.success);
      setActionError(null);
      refresh();
    }
  }, [createState.success]);

  useEffect(() => {
    if (updateState.success) {
      resetCreateForm();
      setActionMessage(updateState.success);
      setActionError(null);
      refresh();
    }
  }, [updateState.success]);

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

  const startEdit = (plan: PackagePlanDetailed) => {
    const draft = draftFromPlan(plan);
    setEditingPlanId(plan.id);
    setName(draft.name);
    setForever(draft.forever);
    setValidityDays(draft.validityDays);
    setOfferRupees(draft.offerRupees);
    setItems(draft.items);
    setActionMessage(null);
    setActionError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectedServiceIds = useMemo(
    () => new Set(items.map((i) => i.serviceId).filter(Boolean)),
    [items],
  );

  const formError = editingPlanId ? updateState.error : createState.error;
  const formPending = editingPlanId ? updatePending : createPending;
  const formAction = editingPlanId ? updateAction : createAction;

  return (
    <div className="space-y-8">
      <div>
        <p className="fyh-section-eyebrow">Configuration</p>
        <h1 className="fyh-display mt-1 font-semibold">Packages</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Prepaid service credits sold at an offer price. Purchase creates credits; redemption is ₹0
          cash with staff performance at effective package value. Editing a package only affects
          future purchases — existing customer credits stay unchanged.
        </p>
      </div>

      {loadError ? <p className="fyh-alert-danger-box text-sm">{loadError}</p> : null}
      {actionError ? <p className="fyh-alert-danger-box text-sm">{actionError}</p> : null}
      {actionMessage ? <p className="text-sm text-fyh-accent">{actionMessage}</p> : null}

      <section className="fyh-panel space-y-4 !p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fyh-on-panel">
            {editingPlanId ? 'Edit package' : 'Create package'}
          </h2>
          {editingPlanId ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetCreateForm}>
              Cancel edit
            </Button>
          ) : null}
        </div>
        <form action={formAction} className="space-y-4">
          {editingPlanId ? <input type="hidden" name="planId" value={editingPlanId} /> : null}
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
                  {services.map((s) => {
                    const taken = selectedServiceIds.has(s.id) && s.id !== item.serviceId;
                    if (taken) return null;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} · {formatInrFromPaise(s.pricePaise)}
                      </option>
                    );
                  })}
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
              disabled={services.length > 0 && selectedServiceIds.size >= services.length}
              onClick={() => setItems((prev) => [...prev, newDraftItem()])}
            >
              + Add service
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

          {formError ? <p className="text-sm text-fyh-danger">{formError}</p> : null}

          <Button type="submit" disabled={formPending}>
            {formPending
              ? editingPlanId
                ? 'Saving…'
                : 'Creating…'
              : editingPlanId
                ? 'Save package'
                : 'Create package'}
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
          <div className="overflow-x-auto rounded-xl border border-[color:var(--fyh-border)]">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-[color:var(--fyh-surface-muted)] text-fyh-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Package</th>
                  <th className="px-4 py-3 font-medium">Services</th>
                  <th className="px-4 py-3 font-medium">Normal value</th>
                  <th className="px-4 py-3 font-medium">Offer</th>
                  <th className="px-4 py-3 font-medium">Discount</th>
                  <th className="px-4 py-3 font-medium">Validity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
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
                    <td className="px-4 py-3">
                      <span
                        className={
                          pkg.isActive ? 'text-fyh-accent font-medium' : 'text-fyh-text-muted'
                        }
                      >
                        {pkg.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <button
                          type="button"
                          className="text-fyh-accent underline-offset-2 hover:underline"
                          onClick={() => startEdit(pkg)}
                        >
                          Edit
                        </button>
                        <span className="text-fyh-text-muted">·</span>
                        {pkg.isActive ? (
                          <button
                            type="button"
                            className="text-fyh-danger underline-offset-2 hover:underline"
                            onClick={() => setDeactivateTarget(pkg)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-fyh-accent underline-offset-2 hover:underline"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                const result = await reactivatePackagePlanAction(pkg.id);
                                if (result.error) {
                                  setActionError(result.error);
                                  setActionMessage(null);
                                } else {
                                  setActionMessage(result.success ?? 'Package activated');
                                  setActionError(null);
                                  refresh();
                                }
                              });
                            }}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deactivateTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] p-5 shadow-lg">
            <h3 className="text-base font-semibold">Deactivate “{deactivateTarget.name}”?</h3>
            <p className="text-sm text-fyh-text-secondary">
              Existing customer packages and unused credits will remain valid. This only prevents new
              purchases.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeactivateTarget(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  const target = deactivateTarget;
                  startTransition(async () => {
                    const result = await deactivatePackagePlanAction(target.id);
                    setDeactivateTarget(null);
                    if (result.error) {
                      setActionError(result.error);
                      setActionMessage(null);
                    } else {
                      setActionMessage(result.success ?? 'Package deactivated');
                      setActionError(null);
                      if (editingPlanId === target.id) resetCreateForm();
                      refresh();
                    }
                  });
                }}
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
