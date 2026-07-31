'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { MoreVertical } from 'lucide-react';
import { createQuickCustomerFromForm } from '@/src/hair/actions/quickSaleCustomer';
import {
  completeQuickSaleAction,
  holdQuickSaleAction,
  listQuickSaleHoldsAction,
  loadQuickSaleHoldAction,
  previewQuickSaleTotalsAction,
  searchCustomersForPosAction,
} from '@/src/hair/actions/quickSale';
import { QuickSaleBasketTable } from '@/src/hair/components/quick-sale/QuickSaleBasketTable';
import { QuickSalePaymentPanel } from '@/src/hair/components/quick-sale/QuickSalePaymentPanel';
import { QuickSaleSuccessDialog } from '@/src/hair/components/quick-sale/QuickSaleSuccessDialog';
import { basketLineFromBillableItem, basketToLegacyLines } from '@/src/hair/domain/basket/legacyBridge';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItem, BillableItemType } from '@/src/hair/domain/catalog/types';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { inferQuickSaleCustomerPrefill } from '@/src/hair/lib/quickSaleCustomerPrefill';
import type { AppointmentCheckoutPrefill } from '@/src/hair/domain/basket/appointmentBridge';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import type { QuickSaleHoldSummary } from '@/src/hair/services/quickSaleHold';
import type { FyhBillingSettings } from '@/src/hair/db/schema/settings';

type SelectedCustomer = PosCustomerHit;
type TabFilter = BillableItemType | 'all';

function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

function matchesBillable(item: BillableItem, q: string) {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return true;
  const hay = [item.name, item.code ?? '', item.category ?? ''].join(' ').toLowerCase();
  if (hay.includes(trimmed)) return true;
  const num = Number(trimmed.replace(/[^\d.]/g, ''));
  if (!Number.isNaN(num) && trimmed.match(/\d/)) {
    const rupees = item.sellingPricePaise / 100;
    if (Math.round(rupees) === Math.round(num)) return true;
  }
  return trimmed.split(/\s+/).every((t) => hay.includes(t));
}

export function QuickSaleShell({
  billableItems,
  googleReviewUrl,
  billingDefaults,
  appointmentPrefill,
  appointmentError,
}: {
  billableItems: BillableItem[];
  googleReviewUrl?: string | null;
  billingDefaults?: FyhBillingSettings;
  appointmentPrefill?: AppointmentCheckoutPrefill | null;
  appointmentError?: string | null;
}) {
  const [step, setStep] = useState<'customer' | 'sale' | 'done'>(
    appointmentPrefill ? 'sale' : 'customer',
  );
  const [customer, setCustomer] = useState<SelectedCustomer | null>(
    appointmentPrefill?.customer ?? null,
  );
  const [appointmentId, setAppointmentId] = useState<string | null>(
    appointmentPrefill?.appointmentId ?? null,
  );
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<PosCustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<TabFilter>('service');
  const [catalogQ, setCatalogQ] = useState('');
  const [lines, setLines] = useState<BasketLine[]>(appointmentPrefill?.lines ?? []);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [flags, setFlags] = useState<BasketFlags>(() => ({
    markDue: billingDefaults?.defaultMarkDue,
    markFullDue: billingDefaults?.defaultMarkFullDue,
    creditOverpayAsAdvance: billingDefaults?.defaultCreditOverpayAsAdvance,
  }));
  const [membershipDiscountPaise, setMembershipDiscountPaise] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [advancePaise, setAdvancePaise] = useState(0);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdInvoiceId, setHoldInvoiceId] = useState<string | null>(null);
  const [heldBills, setHeldBills] = useState<QuickSaleHoldSummary[]>([]);
  const [pending, startTransition] = useTransition();
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const catalogSearchRef = useRef<HTMLInputElement>(null);

  const basket: Basket | null = customer
    ? {
        customerId: customer.id,
        lines,
        payments,
        flags,
        membershipDiscountPaise,
      }
    : null;

  const priced = useMemo(
    () => (basket ? priceBasket(basket) : null),
    [basket, lines, payments, flags, membershipDiscountPaise],
  );

  const filteredItems = useMemo(() => {
    return billableItems.filter((item) => {
      if (tab !== 'all' && item.type !== tab) return false;
      return matchesBillable(item, catalogQ);
    });
  }, [billableItems, tab, catalogQ]);

  const refreshHeldBills = useCallback(() => {
    startTransition(async () => {
      try {
        setHeldBills(await listQuickSaleHoldsAction());
      } catch {
        setHeldBills([]);
      }
    });
  }, []);

  useEffect(() => {
    if (step === 'customer') refreshHeldBills();
  }, [step, refreshHeldBills]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (step === 'customer') customerSearchRef.current?.focus();
      else if (step === 'sale') catalogSearchRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  useEffect(() => {
    if (searchQ.trim().length < 1) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchCustomersForPosAction(searchQ);
        setSearchHits(hits);
        const digits = normalizePhoneDigits(searchQ);
        if (digits.length >= 10) {
          const exact = hits.filter((h) => normalizePhoneDigits(h.phone) === digits);
          if (exact.length === 1) {
            setCustomer(exact[0]!);
            setHoldInvoiceId(null);
            setStep('sale');
          }
        }
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (!customer?.id || lines.length === 0) {
      setMembershipDiscountPaise(0);
      return;
    }
    const t = window.setTimeout(() => {
      startTransition(async () => {
        const preview = await previewQuickSaleTotalsAction({
          customerId: customer.id,
          cartLines: lines.map((l) => {
            const gross = l.snapshot.unitSellingPricePaise * l.quantity;
            const finalPaise = l.overridePricePaise ?? gross;
            return {
              kind: l.billableRef.type,
              unitPricePaise: l.snapshot.unitSellingPricePaise,
              quantity: l.quantity,
              lineDiscountPaise: Math.max(0, gross - finalPaise),
              gstBps: l.snapshot.gstBps,
            };
          }),
        });
        setMembershipDiscountPaise(preview.membershipDiscountPaise);
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [customer?.id, lines]);

  const addItem = (item: BillableItem) => {
    setLines((prev) => [...prev, basketLineFromBillableItem(item)]);
    setCatalogQ('');
  };

  const resetForNext = () => {
    setStep('customer');
    setCustomer(null);
    setAppointmentId(null);
    setSearchQ('');
    setLines([]);
    setPayments([]);
    setFlags({});
    setHoldInvoiceId(null);
    setInvoiceId(null);
    setPrintHtml(null);
    setAdvancePaise(0);
    setError(null);
  };

  async function resumeHold(id: string) {
    const detail = await loadQuickSaleHoldAction(id);
    if (!detail) {
      setError('Held bill not found');
      return;
    }
    setHoldInvoiceId(detail.invoiceId);
    setCustomer({
      id: detail.customer.id,
      fullName: detail.customer.fullName,
      customerCode: detail.customer.customerCode,
      phone: detail.customer.phone,
      walletBalancePaise: detail.customer.walletBalancePaise,
    });
    setLines(
      detail.cart.map((line, i) => ({
        lineId: `hold-${i}`,
        billableRef: { id: line.refId, type: line.kind },
        snapshot: {
          name: line.name,
          code: null,
          unitSellingPricePaise: line.unitPricePaise,
          gstBps: line.gstBps,
          staffMode: line.kind === 'service' ? 'SERVICE' : 'SALE',
          category: null,
        },
        quantity: line.quantity,
        overridePricePaise:
          line.lineDiscountPaise > 0
            ? Math.max(
                0,
                line.unitPricePaise * line.quantity - line.lineDiscountPaise,
              )
            : null,
        staff: line.servicedBy.length
          ? line.servicedBy.map((s) => ({ staffId: s.id, shareBps: 10_000 / line.servicedBy.length }))
          : line.soldBy
            ? [{ staffId: line.soldBy.id, shareBps: 10_000 }]
            : [],
      })),
    );
    setStep('sale');
  }

  if (step === 'done' && invoiceId && customer) {
    return (
      <QuickSaleSuccessDialog
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber ?? undefined}
        customerName={customer.fullName}
        customerPhone={customer.phone}
        grandTotalPaise={priced?.totals.grandTotalPaise ?? 0}
        advancePaise={advancePaise}
        printHtml={printHtml}
        googleReviewUrl={googleReviewUrl}
        onDone={resetForNext}
      />
    );
  }

  if (step === 'customer') {
    return (
      <div className="mx-auto max-w-xl space-y-8 py-6 md:py-10">
        {appointmentError ? (
          <p className="rounded-xl border border-fyh-danger/30 bg-fyh-danger/10 px-4 py-3 text-sm text-fyh-danger">
            {appointmentError}
          </p>
        ) : null}
        <div>
          <p className="fyh-section-eyebrow">Quick Sale</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold text-fyh-text">Find customer</h1>
        </div>
        <div className="flex gap-2">
          <Input
            ref={customerSearchRef}
            autoFocus
            aria-label="Search customer by name, phone, or code"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search name / phone / customer code"
            className="h-14 min-w-0 flex-1 text-lg"
          />
          <Button type="button" className="h-14 shrink-0" onClick={() => setAddOpen(true)}>
            + Add Customer
          </Button>
        </div>
        {searchQ.trim().length >= 1 ? (
          <ul className="divide-y divide-[color:var(--fyh-border)] overflow-hidden rounded-2xl border border-[color:var(--fyh-border)] bg-black/10">
            {searching ? (
              <li className="px-5 py-6 text-center text-sm text-fyh-text-muted">Searching…</li>
            ) : searchHits.length > 0 ? (
              searchHits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-5 py-4 text-left hover:bg-white/5"
                    onClick={() => {
                      setCustomer(hit);
                      setStep('sale');
                    }}
                  >
                    <span className="font-semibold text-fyh-text">{hit.fullName}</span>
                    <span className="text-sm text-fyh-text-muted">
                      {hit.customerCode} · {hit.phone}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-5 py-6 text-center text-sm text-fyh-text-muted">No matching customer</li>
            )}
          </ul>
        ) : null}
        {heldBills.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">Held bills</h2>
            <ul className="divide-y divide-[color:var(--fyh-border)] rounded-xl border border-[color:var(--fyh-border)] bg-black/10">
              {heldBills.map((hold) => (
                <li key={hold.invoiceId}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-4 py-3 text-left hover:bg-white/5"
                    onClick={() => resumeHold(hold.invoiceId)}
                  >
                    <span className="text-sm font-medium">{hold.customerName}</span>
                    <span className="tabular-nums text-fyh-accent">
                      {formatInrFromPaise(hold.grandTotalPaise)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {addOpen ? (
          <QuickAddCustomerModal
            prefill={inferQuickSaleCustomerPrefill(searchQ)}
            onClose={() => setAddOpen(false)}
            onCreated={(c) => {
              setCustomer(c);
              setSearchQ(c.fullName || c.phone);
              setAddOpen(false);
              setStep('sale');
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-4">
      <div className="fyh-glass flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          {appointmentId ? (
            <p className="mb-1 fyh-section-eyebrow">Appointment checkout</p>
          ) : (
            <p className="fyh-section-eyebrow">Customer</p>
          )}
          <button
            type="button"
            className="fyh-display text-left text-lg font-semibold hover:text-fyh-accent"
            onClick={() => setStep('customer')}
          >
            {customer?.fullName}
          </button>
          <p className="text-sm text-fyh-text-muted">
            {customer?.customerCode} · {customer?.phone}
            {customer?.walletBalancePaise ? (
              <> · Wallet {formatInrFromPaise(customer.walletBalancePaise)}</>
            ) : null}
          </p>
        </div>
        <div className="relative">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMenuOpen((o) => !o)}>
            <MoreVertical className="h-5 w-5" />
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm hover:bg-white/5"
                disabled={pending || !customer || lines.length === 0}
                onClick={() => {
                  setMenuOpen(false);
                  if (!customer || !basket) return;
                  startTransition(async () => {
                    setError(null);
                    const res = await holdQuickSaleAction({
                      customerId: customer.id,
                      lines: basketToLegacyLines(basket),
                      holdInvoiceId,
                    });
                    if (res.error) setError(res.error);
                    else resetForNext();
                  });
                }}
              >
                Hold bill
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-1">
        {(
          [
            ['service', 'Services'],
            ['product', 'Products'],
            ['package', 'Packages'],
            ['membership', 'Memberships'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'bg-fyh-accent text-black' : 'text-fyh-text-secondary hover:bg-white/5'
            }`}
            onClick={() => {
              setTab(id);
              setCatalogQ('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Input
          ref={catalogSearchRef}
          aria-label="Search catalog items"
          value={catalogQ}
          onChange={(e) => setCatalogQ(e.target.value)}
          placeholder="Search name, code, or price…"
          className="h-12"
        />
        {catalogQ.trim() && filteredItems.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] py-1 shadow-lg">
            {filteredItems.slice(0, 20).map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => addItem(item)}
                >
                  <span>
                    {item.name}
                    {item.code ? (
                      <span className="ml-2 text-xs text-fyh-text-muted">{item.code}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(item.sellingPricePaise)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <QuickSaleBasketTable
        lines={lines}
        onUpdateLine={(lineId, patch) =>
          setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)))
        }
        onRemoveLine={(lineId) => setLines((prev) => prev.filter((l) => l.lineId !== lineId))}
      />

      {priced ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-fyh-text-muted">Subtotal</span>
              <span className="tabular-nums">{formatInrFromPaise(priced.totals.subtotalBasePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fyh-text-muted">GST</span>
              <span className="tabular-nums">{formatInrFromPaise(priced.totals.taxPaise)}</span>
            </div>
            {priced.totals.lineDiscountPaise > 0 ? (
              <div className="flex justify-between">
                <span className="text-fyh-text-muted">Discount</span>
                <span className="tabular-nums">−{formatInrFromPaise(priced.totals.lineDiscountPaise)}</span>
              </div>
            ) : null}
            {membershipDiscountPaise > 0 ? (
              <div className="flex justify-between">
                <span className="text-fyh-text-muted">Membership</span>
                <span className="tabular-nums">−{formatInrFromPaise(membershipDiscountPaise)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-[color:var(--fyh-border)] pt-2 text-base font-semibold">
              <span>Grand Total</span>
              <span className="tabular-nums text-fyh-accent">
                {formatInrFromPaise(priced.totals.grandTotalPaise)}
              </span>
            </div>
          </div>

          <QuickSalePaymentPanel
            grandTotalPaise={priced.totals.grandTotalPaise}
            payments={payments}
            flags={flags}
            onChangePayments={setPayments}
            onChangeFlags={setFlags}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}

      <Button
        type="button"
        disabled={pending || !customer || lines.length === 0 || !basket}
        className="h-12 w-full"
        onClick={() => {
          if (!basket) return;
          startTransition(async () => {
            setError(null);
            const res = await completeQuickSaleAction({
              basket: { ...basket, membershipDiscountPaise },
              holdInvoiceId,
              source: appointmentId ? 'appointment' : 'quick_sale',
              appointmentId: appointmentId ?? undefined,
            });
            if (res.error) setError(res.error);
            else if (res.invoiceId) {
              setInvoiceId(res.invoiceId);
              setInvoiceNumber(res.invoiceNumber ?? null);
              setAdvancePaise(res.advancePaise ?? 0);
              setPrintHtml(res.printHtml ?? null);
              setStep('done');
            }
          });
        }}
      >
        {pending ? 'Processing…' : 'Confirm sale'}
      </Button>
    </div>
  );
}

function QuickAddCustomerModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: { fullName: string; phone: string };
  onClose: () => void;
  onCreated: (c: SelectedCustomer) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="fyh-glass w-full max-w-md space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setSaving(true);
            setError(null);
            try {
              const res = await createQuickCustomerFromForm(new FormData(e.currentTarget));
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onCreated({ ...res.customer, walletBalancePaise: 0 });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create customer');
            } finally {
              setSaving(false);
            }
          })();
        }}
      >
        <h2 className="fyh-display text-xl font-semibold">Add customer</h2>
        <Input name="fullName" required defaultValue={prefill.fullName} placeholder="Name" />
        <Input name="phone" required type="tel" defaultValue={prefill.phone} placeholder="Phone" />
        <input type="hidden" name="gender" value="female" />
        {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
