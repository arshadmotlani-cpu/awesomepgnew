'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FyhCustomerSearch } from '@/src/hair/components/booking/FyhCustomerSearch';
import { QuickSaleCatalogPanel } from '@/src/hair/components/quick-sale/QuickSaleCatalogPanel';
import { QuickSaleCheckoutColumn } from '@/src/hair/components/quick-sale/QuickSaleCheckoutColumn';
import { QuickSaleCustomerHeader } from '@/src/hair/components/quick-sale/QuickSaleCustomerHeader';
import { useQuickSaleCustomerContext } from '@/src/hair/components/quick-sale/useQuickSaleCustomerContext';
import {
  completeQuickSaleAction,
  holdQuickSaleAction,
  listQuickSaleHoldsAction,
  listStaffForPosRosterAction,
  loadQuickSaleHoldAction,
  previewQuickSaleTotalsAction,
} from '@/src/hair/actions/quickSale';
import { QuickSaleCheckoutProcessing } from '@/src/hair/components/quick-sale/QuickSaleProcessingOverlay';
import { QuickSaleSuccessDialog } from '@/src/hair/components/quick-sale/QuickSaleSuccessDialog';
import { QuickSaleValidationToasts } from '@/src/hair/components/quick-sale/QuickSaleValidationToasts';
import {
  AvailableServicesModal,
  type AvailableServiceSelection,
} from '@/src/hair/components/quick-sale/AvailableServicesModal';
import { basketLineFromBillableItem, basketToLegacyLines } from '@/src/hair/domain/basket/legacyBridge';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItem, BillableItemType } from '@/src/hair/domain/catalog/types';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { computePaymentPanelSummary } from '@/src/hair/lib/quickSalePaymentPanelState';
import {
  buildClearedQuickSaleDraftForCustomer,
  emptyQuickSaleTransactionState,
  hasQuickSaleTransactionContent,
  QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR,
  QUICK_SALE_CHECKOUT_FAILED_ERROR,
  QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR,
} from '@/src/hair/lib/quickSaleLifecycle';
import { validateQuickSaleCheckout } from '@/src/hair/domain/basket/validateCheckout';
import {
  buildQuickSaleSessionSnapshot,
  clearCheckoutPending,
  clearQuickSaleSession,
  loadCheckoutPending,
  loadSessionDraft,
  markQuickSaleCheckoutPending,
  purgeLegacyLocalActiveDraft,
  revertCheckoutPendingToSessionDraft,
  saveSessionDraft,
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
  const [error, setError] = useState<string | null>(null);
  const [holdInvoiceId, setHoldInvoiceId] = useState<string | null>(null);
  const [heldBills, setHeldBills] = useState<QuickSaleHoldSummary[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [preloadedStaff, setPreloadedStaff] = useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [availableServicesOpen, setAvailableServicesOpen] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [validationToasts, setValidationToasts] = useState<string[]>([]);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const checkoutSubmittingRef = useRef(false);
  const saleCompletedRef = useRef(false);

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

  const paymentSummary = useMemo(
    () =>
      priced
        ? computePaymentPanelSummary({
            grandTotalPaise: priced.totals.grandTotalPaise,
            payments,
            flags,
          })
        : null,
    [priced, payments, flags],
  );

  const canCompleteSale = Boolean(basket && priced && paymentSummary?.isComplete);

  const {
    loading: customerContextLoading,
    error: customerContextError,
    context: customerContext,
  } = useQuickSaleCustomerContext(customer?.id ?? null);

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
    purgeLegacyLocalActiveDraft();
    const loaded = loadCheckoutPending() ?? loadSessionDraft();
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
    if (
      !sessionHydrated ||
      step !== 'sale' ||
      !customer ||
      workspaceLocked ||
      saleCompletedRef.current
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      saveSessionDraft(
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
    if (step !== 'sale' || !customer) return;
    let cancelled = false;
    void listStaffForPosRosterAction()
      .then((rows) => {
        if (cancelled) return;
        setPreloadedStaff(rows.map((r) => ({ id: r.id, fullName: r.fullName })));
        setStaffNames((prev) => {
          const next = { ...prev };
          for (const row of rows) next[row.id] = row.fullName;
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setPreloadedStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [step, customer?.id]);

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

  function buildCurrentSessionSnapshot() {
    if (!customer) return null;
    return buildQuickSaleSessionSnapshot({
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
    });
  }

  async function submitCheckout() {
    if (!basket || !priced || checkoutSubmittingRef.current) return;

    const validationErrors = validateQuickSaleCheckout(basket, priced);
    if (validationErrors.length > 0) {
      setValidationToasts(validationErrors);
      return;
    }

    checkoutSubmittingRef.current = true;
    setCheckoutSubmitting(true);
    setError(null);
    setValidationToasts([]);

    const sessionSnapshot = buildCurrentSessionSnapshot();
    if (sessionSnapshot) {
      markQuickSaleCheckoutPending({
        ...sessionSnapshot,
        lifecycle: 'checkout_pending',
      });
    }

    try {
      const res = await completeQuickSaleAction({
        basket: { ...basket, membershipDiscountPaise },
        holdInvoiceId,
        source: appointmentId ? 'appointment' : 'quick_sale',
        appointmentId: appointmentId ?? undefined,
      });
      if (res.error) {
        if (sessionSnapshot) {
          revertCheckoutPendingToSessionDraft(sessionSnapshot);
        }
        setError(
          res.error === 'Could not complete sale'
            ? QUICK_SALE_CHECKOUT_FAILED_ERROR
            : res.error,
        );
      } else if (res.invoiceId) {
        finalizeSuccess({ invoiceId: res.invoiceId });
      } else {
        if (sessionSnapshot) {
          revertCheckoutPendingToSessionDraft(sessionSnapshot);
        }
        setError(QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR);
      }
    } catch {
      if (sessionSnapshot) {
        revertCheckoutPendingToSessionDraft(sessionSnapshot);
      }
      setError(QUICK_SALE_CHECKOUT_FAILED_ERROR);
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
        next.push({
          lineId: `prepaid-${sel.creditId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          billableRef: { id: sel.serviceId, type: 'service' },
          snapshot: {
            name: sel.serviceName,
            code: catalog?.code ?? null,
            unitSellingPricePaise: sel.effectiveUnitValuePaise,
            gstBps: 0,
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
            retailUnitValuePaise: catalog?.sellingPricePaise ?? 0,
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
    clearCheckoutPending();
    if (customer) {
      saveSessionDraft(buildClearedQuickSaleDraftForCustomer(customer));
    } else {
      clearQuickSaleSession();
    }
  };

  const finalizeSuccess = (res: { invoiceId: string }) => {
    saleCompletedRef.current = true;
    clearQuickSaleSession();
    resetTransactionState();
    setInvoiceId(res.invoiceId);
    setError(null);
    setStep('done');
  };

  const clearSaleState = () => {
    saleCompletedRef.current = false;
    clearQuickSaleSession();
    setCustomer(null);
    resetTransactionState();
    setInvoiceId(null);
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
        customerId={customer.id}
        googleReviewUrl={googleReviewUrl}
        onDone={resetForNext}
      />
    );
  }

  if (step === 'customer') {
    return (
      <div className="qs-customer-step">
        {appointmentError ? (
          <p className="fyh-alert-danger-box mb-3">{appointmentError}</p>
        ) : null}
        <div className="qs-customer-step-intro">
          <p className="qs-section-label">Quick Sale</p>
          <h1 className="text-lg font-semibold text-fyh-text">Find customer</h1>
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
          <section className="qs-held-bills">
            <p className="qs-section-label">Held bills</p>
            <table className="qs-held-bills-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {heldBills.map((hold) => (
                  <tr key={hold.invoiceId}>
                    <td>
                      <button
                        type="button"
                        className="qs-held-bill-link"
                        onClick={() => resumeHold(hold.invoiceId)}
                      >
                        {hold.customerName}
                      </button>
                    </td>
                    <td className="text-right tabular-nums text-fyh-accent">
                      {formatInrFromPaise(hold.grandTotalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="qs-pos-shell" aria-busy={workspaceLocked} data-testid="qs-pos-shell">
      <QuickSaleValidationToasts
        messages={validationToasts}
        onDismiss={() => setValidationToasts([])}
      />
      {workspaceLocked ? <QuickSaleCheckoutProcessing /> : null}

      {customer ? (
        <QuickSaleCustomerHeader
          customer={customer}
          appointmentId={appointmentId}
          contextLoading={customerContextLoading}
          contextError={customerContextError}
          context={customerContext}
          workspaceLocked={workspaceLocked}
          canHoldBill={Boolean(customer && lines.length > 0)}
          menuOpen={menuOpen}
          onAvailableServices={() => setAvailableServicesOpen(true)}
          onChangeCustomer={() => setStep('customer')}
          onMenuToggle={() => setMenuOpen((o) => !o)}
          onHoldBill={() => {
            setMenuOpen(false);
            void submitHoldBill();
          }}
          onNewSale={() => {
            setMenuOpen(false);
            startNewSale();
          }}
          onCancelSale={() => {
            setMenuOpen(false);
            cancelSale();
          }}
        />
      ) : null}

      <div className="qs-workstation">
        <QuickSaleCatalogPanel
          tab={tab}
          catalogQ={catalogQ}
          filteredItems={filteredItems}
          workspaceLocked={workspaceLocked}
          catalogSearchRef={catalogSearchRef}
          onTabChange={(nextTab) => {
            setTab(nextTab);
            setCatalogQ('');
          }}
          onCatalogQChange={setCatalogQ}
          onAddItem={addItem}
        />

        {priced && customer ? (
          <QuickSaleCheckoutColumn
            customerId={customer.id}
            lines={lines}
            priced={priced}
            membershipDiscountPaise={membershipDiscountPaise}
            customerOutstandingPaise={customerContext?.duePaise ?? 0}
            payments={payments}
            flags={flags}
            workspaceLocked={workspaceLocked}
            checkoutSubmitting={checkoutSubmitting}
            holdSubmitting={holdSubmitting}
            canCompleteSale={canCompleteSale}
            canHoldBill={Boolean(customer && lines.length > 0)}
            hasActiveTransaction={hasActiveTransaction}
            clearAllConfirmOpen={clearAllConfirmOpen}
            error={error}
            staffNames={staffNames}
            preloadedStaff={preloadedStaff}
            onStaffNameRegistered={(staffId, fullName) =>
              setStaffNames((prev) => ({ ...prev, [staffId]: fullName }))
            }
            onUpdateLine={(lineId, patch) =>
              setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)))
            }
            onRemoveLine={(lineId) => setLines((prev) => prev.filter((l) => l.lineId !== lineId))}
            onOpenClearAll={() => setClearAllConfirmOpen(true)}
            onKeepClearAll={() => setClearAllConfirmOpen(false)}
            onConfirmClearAll={clearCurrentTransaction}
            onChangePayments={setPayments}
            onChangeFlags={setFlags}
            onHoldBill={() => {
              void submitHoldBill();
            }}
            onCompleteSale={() => {
              void submitCheckout();
            }}
          />
        ) : error ? (
          <p className="qs-checkout-error">{error}</p>
        ) : null}
      </div>

      {customer ? (
        <AvailableServicesModal
          customerId={customer.id}
          basketLines={lines}
          open={availableServicesOpen}
          onClose={() => setAvailableServicesOpen(false)}
          onConfirm={addPrepaidSelections}
        />
      ) : null}
    </div>
  );
}
