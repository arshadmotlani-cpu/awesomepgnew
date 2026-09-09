'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { FyhCustomerSearch } from '@/src/hair/components/booking/FyhCustomerSearch';
import { FyhCustomerContextStrip } from '@/src/hair/components/customers/FyhCustomerContextStrip';
import {
  completeQuickSaleAction,
  holdQuickSaleAction,
  listQuickSaleHoldsAction,
  loadQuickSaleHoldAction,
  previewQuickSaleTotalsAction,
} from '@/src/hair/actions/quickSale';
import { QuickSaleBasketTable } from '@/src/hair/components/quick-sale/QuickSaleBasketTable';
import { QuickSaleClearAllConfirm } from '@/src/hair/components/quick-sale/QuickSaleClearAllConfirm';
import { QuickSalePaymentPanel } from '@/src/hair/components/quick-sale/QuickSalePaymentPanel';
import { QuickSaleCheckoutProcessing } from '@/src/hair/components/quick-sale/QuickSaleProcessingOverlay';
import { QuickSaleSuccessDialog } from '@/src/hair/components/quick-sale/QuickSaleSuccessDialog';
import {
  AvailableServicesModal,
  type AvailableServiceSelection,
} from '@/src/hair/components/quick-sale/AvailableServicesModal';
import { basketLineFromBillableItem, basketToLegacyLines } from '@/src/hair/domain/basket/legacyBridge';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItem, BillableItemType } from '@/src/hair/domain/catalog/types';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  buildClearedQuickSaleDraftForCustomer,
  emptyQuickSaleTransactionState,
  hasQuickSaleTransactionContent,
  QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR,
  QUICK_SALE_CHECKOUT_FAILED_ERROR,
  QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR,
} from '@/src/hair/lib/quickSaleLifecycle';
import {
  buildQuickSaleSessionSnapshot,
  clearQuickSaleSession,
  loadQuickSaleSession,
  markQuickSaleCheckoutPending,
  saveQuickSaleSession,
  type QuickSaleTab,
} from '@/src/hair/lib/quickSaleSession';
import type { AppointmentCheckoutPrefill } from '@/src/hair/domain/basket/appointmentBridge';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import type { QuickSaleHoldSummary } from '@/src/hair/services/quickSaleHold';
import type { FyhBillingSettings } from '@/src/hair/db/schema/settings';

type SelectedCustomer = PosCustomerHit;
type TabFilter = QuickSaleTab;

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
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [availableServicesOpen, setAvailableServicesOpen] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [successGrandTotalPaise, setSuccessGrandTotalPaise] = useState(0);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const checkoutSubmittingRef = useRef(false);

  const workspaceLocked = checkoutSubmitting || holdSubmitting;
  const hasActiveTransaction = hasQuickSaleTransactionContent({
    lines,
    payments,
    holdInvoiceId,
  });

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

  const refreshHeldBills = useCallback(async () => {
    try {
      setHeldBills(await listQuickSaleHoldsAction());
    } catch {
      setHeldBills([]);
    }
  }, []);

  useEffect(() => {
    if (appointmentPrefill) {
      setSessionHydrated(true);
      return;
    }
    const loaded = loadQuickSaleSession();
    if (loaded) {
      const { snapshot, interruptedCheckout } = loaded;
      setCustomer(snapshot.customer);
      setAppointmentId(snapshot.appointmentId);
      setTab(snapshot.tab);
      setCatalogQ(snapshot.catalogQ);
      setLines(snapshot.lines);
      setPayments(snapshot.payments);
      setFlags(snapshot.flags);
      setHoldInvoiceId(snapshot.holdInvoiceId);
      setStaffNames(snapshot.staffNames ?? {});
      setStep('sale');
      if (interruptedCheckout) {
        setError(QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR);
      }
    }
    setSessionHydrated(true);
  }, [appointmentPrefill]);

  useEffect(() => {
    if (!sessionHydrated || step !== 'sale' || !customer || workspaceLocked) return;
    const t = window.setTimeout(() => {
      saveQuickSaleSession(
        buildQuickSaleSessionSnapshot({
          customer,
          appointmentId,
          tab,
          catalogQ,
          lines,
          payments,
          flags,
          holdInvoiceId,
          staffNames,
          lifecycle: 'active_draft',
        }),
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    sessionHydrated,
    step,
    customer,
    appointmentId,
    tab,
    catalogQ,
    lines,
    payments,
    flags,
    holdInvoiceId,
    staffNames,
    workspaceLocked,
  ]);

  useEffect(() => {
    if (step === 'customer') refreshHeldBills();
  }, [step, refreshHeldBills]);

  useEffect(() => {
    if (workspaceLocked) setClearAllConfirmOpen(false);
  }, [workspaceLocked]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (step === 'sale') catalogSearchRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  useEffect(() => {
    if (!customer?.id || lines.length === 0) {
      setMembershipDiscountPaise(0);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
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
      if (!cancelled) setMembershipDiscountPaise(preview.membershipDiscountPaise);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [customer?.id, lines]);

  const addItem = (item: BillableItem) => {
    if (workspaceLocked) return;
    setLines((prev) => [...prev, basketLineFromBillableItem(item)]);
    setCatalogQ('');
    catalogSearchRef.current?.focus();
  };

  async function submitHoldBill() {
    if (!customer || !basket || holdSubmitting) return;
    setHoldSubmitting(true);
    setError(null);
    try {
      const res = await holdQuickSaleAction({
        customerId: customer.id,
        lines: basketToLegacyLines(basket),
        holdInvoiceId,
      });
      if (res.error) setError(res.error);
      else resetForNext();
    } finally {
      setHoldSubmitting(false);
    }
  }

  async function submitCheckout() {
    if (!basket || checkoutSubmittingRef.current) return;
    checkoutSubmittingRef.current = true;
    setCheckoutSubmitting(true);
    setError(null);
    if (customer) {
      markQuickSaleCheckoutPending(
        buildQuickSaleSessionSnapshot({
          customer,
          appointmentId,
          tab,
          catalogQ,
          lines,
          payments,
          flags,
          holdInvoiceId,
          staffNames,
          lifecycle: 'checkout_pending',
        }),
      );
    }
    try {
      const res = await completeQuickSaleAction({
        basket: { ...basket, membershipDiscountPaise },
        holdInvoiceId,
        source: appointmentId ? 'appointment' : 'quick_sale',
        appointmentId: appointmentId ?? undefined,
      });
      if (res.error) {
        setError(
          res.error === 'Could not complete sale'
            ? QUICK_SALE_CHECKOUT_FAILED_ERROR
            : res.error,
        );
      } else if (res.invoiceId) {
        finalizeSuccess({
          invoiceId: res.invoiceId,
          invoiceNumber: res.invoiceNumber ?? null,
          advancePaise: res.advancePaise ?? 0,
          printHtml: res.printHtml ?? null,
        });
      } else setError(QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR);
    } finally {
      checkoutSubmittingRef.current = false;
      setCheckoutSubmitting(false);
    }
  }

  const addPrepaidSelections = (selections: AvailableServiceSelection[]) => {
    if (selections.length === 0) return;
    setLines((prev) => {
      const next = [...prev];
      for (const sel of selections) {
        const catalog = billableItems.find(
          (b) => b.type === 'service' && b.id === sel.serviceId,
        );
        const retailPaise = catalog?.sellingPricePaise ?? sel.effectiveUnitValuePaise;
        next.push({
          lineId: `prepaid-${sel.creditId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          billableRef: { id: sel.serviceId, type: 'service' },
          snapshot: {
            name: sel.serviceName,
            code: catalog?.code ?? null,
            unitSellingPricePaise: retailPaise,
            gstBps: catalog?.gstBps ?? SALON_GST_BPS,
            staffMode: 'SERVICE',
            category: 'Package Redemption',
          },
          quantity: sel.quantity,
          overridePricePaise: 0,
          staff: [],
          prepaidRedemption: {
            kind: 'package_redemption',
            customerPackageId: sel.customerPackageId,
            creditId: sel.creditId,
            serviceId: sel.serviceId,
            packageName: sel.packageName,
            effectiveUnitValuePaise: sel.effectiveUnitValuePaise,
          },
        });
      }
      return next;
    });
  };

  const resetTransactionState = () => {
    const tx = emptyQuickSaleTransactionState();
    setLines(tx.lines);
    setPayments(tx.payments);
    setFlags(tx.flags);
    setHoldInvoiceId(tx.holdInvoiceId);
    setStaffNames(tx.staffNames);
    setCatalogQ(tx.catalogQ);
    setTab(tx.tab);
    setMembershipDiscountPaise(tx.membershipDiscountPaise);
    setAppointmentId(null);
  };

  const clearCurrentTransaction = () => {
    if (workspaceLocked) return;
    resetTransactionState();
    setError(null);
    setClearAllConfirmOpen(false);
    if (customer) {
      saveQuickSaleSession(buildClearedQuickSaleDraftForCustomer(customer));
    } else {
      clearQuickSaleSession();
    }
  };

  const finalizeSuccess = (res: {
    invoiceId: string;
    invoiceNumber?: string | null;
    advancePaise?: number;
    printHtml?: string | null;
  }) => {
    setSuccessGrandTotalPaise(priced?.totals.grandTotalPaise ?? 0);
    clearQuickSaleSession();
    resetTransactionState();
    setInvoiceId(res.invoiceId);
    setInvoiceNumber(res.invoiceNumber ?? null);
    setAdvancePaise(res.advancePaise ?? 0);
    setPrintHtml(res.printHtml ?? null);
    setError(null);
    setStep('done');
  };

  const clearSaleState = () => {
    clearQuickSaleSession();
    setCustomer(null);
    resetTransactionState();
    setInvoiceId(null);
    setPrintHtml(null);
    setAdvancePaise(0);
    setError(null);
  };

  const resetForNext = () => {
    clearSaleState();
    setStep('customer');
  };

  const cancelSale = () => {
    clearSaleState();
    setStep('customer');
  };

  const startNewSale = () => {
    clearSaleState();
    setStep('customer');
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
    const names: Record<string, string> = {};
    for (const line of detail.cart) {
      for (const s of line.servicedBy) names[s.id] = s.fullName;
      if (line.soldBy) names[line.soldBy.id] = line.soldBy.fullName;
    }
    setStaffNames(names);
    setStep('sale');
  }

  if (step === 'done' && invoiceId && customer) {
    return (
      <QuickSaleSuccessDialog
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber ?? undefined}
        customerName={customer.fullName}
        customerPhone={customer.phone}
        grandTotalPaise={successGrandTotalPaise}
        advancePaise={advancePaise}
        printHtml={printHtml}
        googleReviewUrl={googleReviewUrl}
        onDone={resetForNext}
      />
    );
  }

  if (step === 'customer') {
    return (
      <div className="fyh-page mx-auto max-w-xl py-4 md:py-6">
        {appointmentError ? (
          <p className="fyh-alert-danger-box">{appointmentError}</p>
        ) : null}
        <div>
          <p className="fyh-section-eyebrow">Quick Sale</p>
          <h1 className="fyh-display mt-1 font-semibold text-fyh-text">Find customer</h1>
        </div>
        <FyhCustomerSearch
          autoFocus
          createContext="quick_sale"
          placeholder="Search name / phone / customer code"
          onSelect={(hit) => {
            setCustomer(hit);
            setHoldInvoiceId(null);
            setStep('sale');
          }}
        />
        {heldBills.length > 0 ? (
          <section className="space-y-2">
            <h2 className="fyh-label uppercase tracking-wide">Held bills</h2>
            <ul className="divide-y divide-[color:var(--fyh-border)] rounded-[var(--fyh-radius-lg)] border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)]">
              {heldBills.map((hold) => (
                <li key={hold.invoiceId}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-3 py-2.5 text-left hover:bg-[color-mix(in_srgb,var(--fyh-accent)_6%,transparent)]"
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
      </div>
    );
  }

  return (
    <div className="qs-pos-shell" aria-busy={workspaceLocked} data-testid="qs-pos-shell">
      {workspaceLocked ? <QuickSaleCheckoutProcessing /> : null}
      {/* Customer — compact header bar */}
      <section className="qs-section shrink-0">
        <div className="qs-customer-bar">
          <div className="qs-customer-meta">
            <p className="qs-section-label !mb-0">
              {appointmentId ? 'Appointment' : 'Customer'}
            </p>
            {customer ? (
              <>
                <p className="truncate text-sm font-semibold text-fyh-text">
                  {customer.fullName}
                  <span className="ml-1.5 font-normal text-fyh-text-secondary">
                    · {customer.customerCode}
                  </span>
                </p>
                <FyhCustomerContextStrip
                  customerId={customer.id}
                  customerName={customer.fullName}
                  variant="compact"
                  className="!mt-0"
                />
              </>
            ) : (
              <p className="text-sm text-fyh-text-label">Select a customer to continue</p>
            )}
          </div>
          <div className="qs-customer-actions">
            {customer ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={workspaceLocked}
                onClick={() => setAvailableServicesOpen(true)}
              >
                Available Services
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-fyh-text-muted"
              disabled={workspaceLocked}
              onClick={() => setStep('customer')}
            >
              Change customer
            </Button>
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={workspaceLocked}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] py-1 shadow-xl">
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-white/5"
                    disabled={workspaceLocked || !customer || lines.length === 0}
                    onClick={() => {
                      setMenuOpen(false);
                      void submitHoldBill();
                    }}
                  >
                    Hold bill
                  </button>
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-white/5"
                    disabled={workspaceLocked}
                    onClick={() => {
                      setMenuOpen(false);
                      startNewSale();
                    }}
                  >
                    New sale
                  </button>
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm text-fyh-danger hover:bg-white/5"
                    disabled={workspaceLocked}
                    onClick={() => {
                      setMenuOpen(false);
                      cancelSale();
                    }}
                  >
                    Cancel sale
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Catalog + Search — one compact block */}
      <section className="qs-section shrink-0 space-y-2">
        <div className="flex gap-1 overflow-x-auto rounded-md border border-[color:var(--fyh-border)] bg-black/15 p-0.5">
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
              disabled={workspaceLocked}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition ${
                tab === id
                  ? 'bg-[color:var(--fyh-accent)] text-black shadow-sm'
                  : 'text-fyh-text-secondary hover:bg-white/5'
              }`}
              onClick={() => {
                setTab(id);
                setCatalogQ('');
                catalogSearchRef.current?.focus();
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
            disabled={workspaceLocked}
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredItems[0]) {
                e.preventDefault();
                addItem(filteredItems[0]);
              }
              if (e.key === 'ArrowDown' && filteredItems.length > 0) {
                e.preventDefault();
                const first = document.querySelector<HTMLButtonElement>('[data-qs-catalog-item]');
                first?.focus();
              }
            }}
            placeholder="Search name, code, or price…"
            className="h-9 text-sm"
          />
          {catalogQ.trim() && filteredItems.length > 0 ? (
            <ul className="absolute z-[80] mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] py-1 shadow-xl">
              {filteredItems.slice(0, 20).map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    data-qs-catalog-item
                    className="qs-catalog-row"
                    disabled={workspaceLocked}
                    onClick={() => addItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(item);
                      }
                    }}
                  >
                    <span className="qs-catalog-name truncate font-medium text-fyh-text">
                      {item.name}
                      {item.code ? (
                        <span className="ml-2 text-xs font-normal text-fyh-text-muted">{item.code}</span>
                      ) : null}
                    </span>
                    <span className="qs-catalog-price">{formatInrFromPaise(item.sellingPricePaise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* Basket — primary working area; scrolls internally when tall */}
      <section className="qs-section qs-basket-section">
        <div className="qs-basket-header shrink-0">
          <p className="qs-section-label !mb-0">Basket</p>
          {hasActiveTransaction ? (
            <div className="relative">
              <button
                type="button"
                className="qs-clear-all-trigger rounded px-1 py-0.5 transition hover:bg-white/5 disabled:opacity-40"
                disabled={workspaceLocked}
                data-testid="qs-clear-all-trigger"
                onClick={() => setClearAllConfirmOpen(true)}
              >
                Clear all
              </button>
              {clearAllConfirmOpen ? (
                <QuickSaleClearAllConfirm
                  onKeep={() => setClearAllConfirmOpen(false)}
                  onConfirm={clearCurrentTransaction}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <QuickSaleBasketTable
          lines={lines}
          locked={workspaceLocked}
          staffNames={staffNames}
          onStaffNameRegistered={(staffId, fullName) =>
            setStaffNames((prev) => ({ ...prev, [staffId]: fullName }))
          }
          onUpdateLine={(lineId, patch) =>
            setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)))
          }
          onRemoveLine={(lineId) => setLines((prev) => prev.filter((l) => l.lineId !== lineId))}
        />
      </section>

      {priced ? (
        <div className="qs-footer-grid shrink-0">
          <section className="fyh-panel-financial !p-3">
            <p className="qs-section-label">Totals</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="fyh-panel-label">Subtotal</span>
                <span className="fyh-money-value tabular-nums">{formatInrFromPaise(priced.totals.subtotalBasePaise)}</span>
              </div>
              <div className="flex justify-between">
                <span className="fyh-panel-label">GST</span>
                <span className="fyh-money-value tabular-nums">{formatInrFromPaise(priced.totals.taxPaise)}</span>
              </div>
              {priced.totals.lineDiscountPaise > 0 ? (
                <div className="flex justify-between">
                  <span className="fyh-panel-label">Line discount</span>
                  <span className="tabular-nums font-medium text-fyh-danger">
                    −{formatInrFromPaise(priced.totals.lineDiscountPaise)}
                  </span>
                </div>
              ) : null}
              {membershipDiscountPaise > 0 ? (
                <div className="flex justify-between">
                  <span className="fyh-panel-label">Membership</span>
                  <span className="tabular-nums font-medium text-fyh-danger">
                    −{formatInrFromPaise(membershipDiscountPaise)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[color:var(--fyh-border-panel)] pt-2">
                <span className="text-sm font-semibold text-fyh-on-panel">Grand total</span>
                <span className="fyh-money-value-accent tabular-nums text-base">
                  {formatInrFromPaise(priced.totals.grandTotalPaise)}
                </span>
              </div>
            </div>
          </section>

          <section className="qs-section">
            <p className="qs-section-label">Payment</p>
            <QuickSalePaymentPanel
              grandTotalPaise={priced.totals.grandTotalPaise}
              payments={payments}
              flags={flags}
              locked={workspaceLocked}
              onChangePayments={setPayments}
              onChangeFlags={setFlags}
            />
          </section>

          <section className="qs-section flex flex-col justify-end gap-2">
            {error ? (
              <p className="rounded-md border border-fyh-danger/30 bg-fyh-danger/10 px-3 py-2 text-xs text-fyh-danger">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              disabled={checkoutSubmitting || holdSubmitting || !customer || lines.length === 0 || !basket}
              className="h-10 w-full text-sm font-semibold"
              data-testid="qs-confirm-sale"
              onClick={() => {
                void submitCheckout();
              }}
            >
              {checkoutSubmitting ? 'Processing…' : 'Confirm sale'}
            </Button>
          </section>
        </div>
      ) : error ? (
        <p className="rounded-md border border-fyh-danger/30 bg-fyh-danger/10 px-3 py-2 text-sm text-fyh-danger">
          {error}
        </p>
      ) : null}

      {customer ? (
        <AvailableServicesModal
          customerId={customer.id}
          open={availableServicesOpen}
          onClose={() => setAvailableServicesOpen(false)}
          onConfirm={addPrepaidSelections}
        />
      ) : null}
    </div>
  );
}
