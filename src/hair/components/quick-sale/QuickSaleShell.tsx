'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  completeQuickSaleAction,
  createQuickCustomerAction,
  holdQuickSaleAction,
  listQuickSaleHoldsAction,
  loadQuickSaleHoldAction,
  previewQuickSaleTotalsAction,
  searchCustomersForPosAction,
} from '@/src/hair/actions/quickSale';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { computeGrandTotalFromParts, sumCartLines } from '@/src/hair/lib/invoiceMath';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  ServicedByMulti,
  StaffTypeahead,
  type StaffPick,
} from '@/src/hair/components/quick-sale/QuickSaleStaffPickers';
import type { QuickSaleCatalog, PosCustomerHit } from '@/src/hair/services/quickSale';
import type { PaymentSplitInput, QuickSaleLineInput } from '@/src/hair/services/invoices';
import {
  attributedNetForShare,
  discountBpsFromPaise,
  discountPaiseFromBps,
  normalizeEqualShares,
} from '@/src/hair/lib/attributionMath';
import type { QuickSaleHoldSummary } from '@/src/hair/services/quickSaleHold';

type SelectedCustomer = PosCustomerHit & { walletBalancePaise?: number };

function lineGrossPaise(line: { unitPricePaise: number; quantity: number }) {
  return line.unitPricePaise * line.quantity;
}

function cartToQuickSaleLines(cart: CartLine[]): QuickSaleLineInput[] {
  return cart.map((c) => ({
    kind: c.kind,
    refId: c.refId,
    quantity: c.quantity,
    lineDiscountPaise: c.lineDiscountPaise,
    lineDiscountBps: c.lineDiscountBps,
    servicedBy:
      c.kind === 'service' ? c.servicedBy.map((s) => ({ staffId: s.id })) : undefined,
    soldByStaffId: c.kind !== 'service' ? (c.soldBy?.id ?? null) : undefined,
    staffId:
      c.kind === 'service' ? (c.servicedBy[0]?.id ?? null) : (c.soldBy?.id ?? null),
  }));
}

function paymentDraftFromFields(pay: {
  payCash: string;
  payUpi: string;
  payCard: string;
  payBank: string;
  payWallet: string;
}) {
  return {
    cash: pay.payCash,
    upi: pay.payUpi,
    card: pay.payCard,
    bank: pay.payBank,
    wallet: pay.payWallet,
  };
}

type CartLine = {
  key: string;
  kind: QuickSaleLineInput['kind'];
  refId: string;
  name: string;
  unitPricePaise: number;
  gstBps: number;
  quantity: number;
  lineDiscountPaise: number;
  lineDiscountBps: number;
  servicedBy: StaffPick[];
  soldBy: StaffPick | null;
};

type TabId = 'services' | 'products' | 'packages' | 'memberships';

function matchesCatalogQuery(
  item: {
    name: string;
    code?: string | null;
    sku?: string | null;
    category?: string | null;
    description?: string | null;
    pricePaise: number;
  },
  q: string,
) {
  const trimmed = q.trim();
  if (!trimmed) return true;
  if (/^cl[\d]*$/i.test(trimmed.replace(/\s/g, ''))) return true;
  const lower = trimmed.toLowerCase();
  const parts = [
    item.name,
    item.code ?? '',
    item.sku ?? '',
    item.category ?? '',
    item.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
  if (parts.includes(lower)) return true;
  const num = Number(trimmed.replace(/[^\d.]/g, ''));
  if (!Number.isNaN(num) && trimmed.match(/\d/)) {
    const rupees = item.pricePaise / 100;
    if (Math.round(rupees) === Math.round(num)) return true;
    if (String(rupees).includes(trimmed)) return true;
  }
  return lower.split(/\s+/).every((token) => parts.includes(token));
}

export function QuickSaleShell({ catalog }: { catalog: QuickSaleCatalog }) {
  const [step, setStep] = useState<'customer' | 'sale' | 'done'>('customer');
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<PosCustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('services');
  const [catalogQ, setCatalogQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [invoiceDiscountPaise, setInvoiceDiscountPaise] = useState(0);
  const [walletRedeemPaise, setWalletRedeemPaise] = useState(0);
  const [tipPaise, setTipPaise] = useState(0);
  const [roundOffPaise, setRoundOffPaise] = useState(0);
  const [membershipDiscountPaise, setMembershipDiscountPaise] = useState(0);
  const [availableWalletPaise, setAvailableWalletPaise] = useState(0);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payCash, setPayCash] = useState('');
  const [payUpi, setPayUpi] = useState('');
  const [payCard, setPayCard] = useState('');
  const [payBank, setPayBank] = useState('');
  const [payWallet, setPayWallet] = useState('');
  const [holdInvoiceId, setHoldInvoiceId] = useState<string | null>(null);
  const [heldBills, setHeldBills] = useState<QuickSaleHoldSummary[]>([]);
  const [pending, startTransition] = useTransition();

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
    if (searchQ.trim().length < 1) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        setSearchHits(await searchCustomersForPosAction(searchQ));
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  const localTotals = useMemo(() => {
    const lines = cart.map((c) => ({
      kind: c.kind,
      unitPricePaise: c.unitPricePaise,
      quantity: c.quantity,
      lineDiscountPaise: c.lineDiscountPaise,
      gstBps: c.gstBps,
    }));
    const { subtotalPaise, taxPaise } = sumCartLines(lines);
    const { grandTotalPaise } = computeGrandTotalFromParts({
      subtotalPaise,
      taxPaise,
      discountPaise: invoiceDiscountPaise,
      membershipDiscountPaise,
      packageRedeemPaise: 0,
      walletRedeemPaise,
      tipPaise,
      roundOffPaise,
    });
    return { subtotalPaise, taxPaise, grandTotalPaise };
  }, [
    cart,
    invoiceDiscountPaise,
    membershipDiscountPaise,
    walletRedeemPaise,
    tipPaise,
    roundOffPaise,
  ]);

  useEffect(() => {
    if (!customer?.id || cart.length === 0) {
      setMembershipDiscountPaise(0);
      setAvailableWalletPaise(customer?.walletBalancePaise ?? 0);
      return;
    }
    const t = window.setTimeout(() => {
      startTransition(async () => {
        const preview = await previewQuickSaleTotalsAction({
          customerId: customer.id,
          cartLines: cart.map((c) => ({
            kind: c.kind,
            unitPricePaise: c.unitPricePaise,
            quantity: c.quantity,
            lineDiscountPaise: c.lineDiscountPaise,
            gstBps: c.gstBps,
          })),
          discountPaise: invoiceDiscountPaise,
          walletRedeemPaise,
          tipPaise,
          roundOffPaise,
        });
        setMembershipDiscountPaise(preview.membershipDiscountPaise);
        setAvailableWalletPaise(preview.availableWalletPaise);
      });
    }, 200);
    return () => window.clearTimeout(t);
  }, [customer?.id, cart, invoiceDiscountPaise, walletRedeemPaise, tipPaise, roundOffPaise]);

  const addToCart = useCallback(
    (line: Omit<CartLine, 'key' | 'quantity' | 'lineDiscountPaise' | 'lineDiscountBps' | 'servicedBy' | 'soldBy'>) => {
      setCart((prev) => [
        ...prev,
        {
          ...line,
          key: `${line.kind}-${line.refId}-${Date.now()}`,
          quantity: 1,
          lineDiscountPaise: 0,
          lineDiscountBps: 0,
          servicedBy: [],
          soldBy: null,
        },
      ]);
    },
    [],
  );

  const filteredServices = useMemo(
    () => catalog.services.filter((s) => matchesCatalogQuery({ ...s, code: s.code }, catalogQ)),
    [catalog.services, catalogQ],
  );
  const filteredProducts = useMemo(
    () => catalog.products.filter((p) => matchesCatalogQuery({ ...p, sku: p.sku }, catalogQ)),
    [catalog.products, catalogQ],
  );
  const filteredPackages = useMemo(
    () => catalog.packages.filter((p) => matchesCatalogQuery(p, catalogQ)),
    [catalog.packages, catalogQ],
  );
  const filteredMemberships = useMemo(
    () => catalog.memberships.filter((p) => matchesCatalogQuery(p, catalogQ)),
    [catalog.memberships, catalogQ],
  );

  function resetForNext() {
    setStep('customer');
    setCustomer(null);
    setSearchQ('');
    setCart([]);
    setHoldInvoiceId(null);
    setInvoiceId(null);
    setPrintHtml(null);
    setInvoiceDiscountPaise(0);
    setWalletRedeemPaise(0);
    setTipPaise(0);
    setRoundOffPaise(0);
    setPayCash('');
    setPayUpi('');
    setPayCard('');
    setPayBank('');
    setPayWallet('');
    setError(null);
  }

  async function resumeHold(invoiceId: string) {
    setError(null);
    const detail = await loadQuickSaleHoldAction(invoiceId);
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
    setAvailableWalletPaise(detail.customer.walletBalancePaise);
    setCart(
      detail.cart.map((line, i) => ({
        key: `${line.kind}-${line.refId}-hold-${i}`,
        kind: line.kind,
        refId: line.refId,
        name: line.name,
        unitPricePaise: line.unitPricePaise,
        gstBps: line.gstBps,
        quantity: line.quantity,
        lineDiscountPaise: line.lineDiscountPaise,
        lineDiscountBps: line.lineDiscountBps,
        servicedBy: line.servicedBy,
        soldBy: line.soldBy,
      })),
    );
    setInvoiceDiscountPaise(detail.invoiceDiscountPaise);
    setWalletRedeemPaise(detail.walletRedeemPaise);
    setTipPaise(detail.tipPaise);
    setRoundOffPaise(detail.roundOffPaise);
    const draft = detail.posDraft?.paymentDraft;
    if (draft) {
      setPayCash(draft.cash ?? '');
      setPayUpi(draft.upi ?? '');
      setPayCard(draft.card ?? '');
      setPayBank(draft.bank ?? '');
      setPayWallet(draft.wallet ?? '');
    }
    setStep('sale');
  }

  if (step === 'done' && invoiceId) {
    return (
      <div className="mx-auto max-w-lg space-y-8 py-12 text-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Quick Sale</p>
          <h1 className="fyh-display mt-2 text-3xl font-semibold text-fyh-text">Sale complete</h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">Invoice recorded successfully.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/billing/${invoiceId}`}>
            <Button type="button">View invoice</Button>
          </Link>
          {printHtml ? <PrintInvoiceButton html={printHtml} /> : null}
          <Button type="button" variant="secondary" onClick={resetForNext}>
            New quick sale
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'customer') {
    return (
      <div className="mx-auto max-w-xl space-y-8 py-6 md:py-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Quick Sale</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold text-fyh-text">Find customer</h1>
        </div>
        <Input
          autoFocus
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search by name, phone number, customer code..."
          className="h-14 text-lg"
        />
        <ul className="divide-y divide-[color:var(--fyh-border)] overflow-hidden rounded-2xl border border-[color:var(--fyh-border)] bg-black/10">
          {searching && searchQ ? (
            <li className="px-5 py-8 text-center text-sm text-fyh-text-muted">Searching…</li>
          ) : null}
          {!searching &&
            searchHits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-0.5 px-5 py-4 text-left transition hover:bg-white/5"
                  onClick={() => {
                    setCustomer({ ...hit, walletBalancePaise: hit.walletBalancePaise });
                    setAvailableWalletPaise(hit.walletBalancePaise);
                    setHoldInvoiceId(null);
                    setStep('sale');
                  }}
                >
                  <span className="text-base font-semibold uppercase tracking-wide text-fyh-text">
                    {hit.fullName}
                  </span>
                  <span className="text-sm tabular-nums text-fyh-text-secondary">
                    {hit.customerCode ?? '—'}
                  </span>
                  <span className="text-sm tabular-nums text-fyh-text-muted">{hit.phone}</span>
                </button>
              </li>
            ))}
          {!searching && searchQ.length >= 1 && searchHits.length === 0 ? (
            <li className="space-y-4 px-5 py-10 text-center">
              <p className="text-sm text-fyh-text-muted">No customer found</p>
              <Button type="button" onClick={() => setAddOpen(true)}>
                + Add Customer
              </Button>
            </li>
          ) : null}
        </ul>
        {addOpen ? (
          <QuickAddCustomerModal
            onClose={() => setAddOpen(false)}
            onCreated={(c) => {
              setCustomer(c);
              setAddOpen(false);
              setHoldInvoiceId(null);
              setStep('sale');
            }}
          />
        ) : null}
        {heldBills.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-muted">
              Held bills
            </h2>
            <ul className="divide-y divide-[color:var(--fyh-border)] overflow-hidden rounded-2xl border border-[color:var(--fyh-border)] bg-black/10">
              {heldBills.map((hold) => (
                <li key={hold.invoiceId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/5"
                    onClick={() => resumeHold(hold.invoiceId)}
                  >
                    <span>
                      <span className="block font-semibold text-fyh-text">{hold.customerName}</span>
                      <span className="text-xs text-fyh-text-muted">
                        {hold.lineCount} items · {hold.customerCode ?? hold.phone}
                      </span>
                    </span>
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

  const grandTotal = localTotals.grandTotalPaise;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="min-w-0 flex-1 space-y-4 lg:max-w-[62%]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Quick Sale</p>
            <button
              type="button"
              className="fyh-display mt-1 text-left text-xl font-semibold text-fyh-text hover:text-fyh-accent"
              onClick={() => setStep('customer')}
            >
              {customer?.fullName}
              <span className="ml-2 text-sm font-normal text-fyh-text-muted">
                {customer?.customerCode} · {customer?.phone}
              </span>
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['services', 'Services'],
              ['products', 'Products'],
              ['packages', 'Packages'],
              ['memberships', 'Memberships'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={tab === id ? 'primary' : 'secondary'}
              onClick={() => {
                setTab(id);
                setCatalogQ('');
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Input
          value={catalogQ}
          onChange={(e) => setCatalogQ(e.target.value)}
          placeholder="Search name, code, price, category…"
          className="h-12 text-base"
        />
        <div className="grid max-h-[min(52vh,640px)] gap-2 overflow-y-auto sm:grid-cols-2">
          {tab === 'services'
            ? filteredServices.map((s) => (
                <CatalogTile
                  key={s.id}
                  title={s.name}
                  meta={[s.code, s.category].filter(Boolean).join(' · ')}
                  pricePaise={s.pricePaise}
                  onPick={() =>
                    addToCart({
                      kind: 'service',
                      refId: s.id,
                      name: s.name,
                      unitPricePaise: s.pricePaise,
                      gstBps: s.gstBps,
                    })
                  }
                />
              ))
            : null}
          {tab === 'products'
            ? filteredProducts.map((p) => (
                <CatalogTile
                  key={p.id}
                  title={p.name}
                  meta={[p.sku, p.category].filter(Boolean).join(' · ')}
                  pricePaise={p.pricePaise}
                  onPick={() =>
                    addToCart({
                      kind: 'product',
                      refId: p.id,
                      name: p.name,
                      unitPricePaise: p.pricePaise,
                      gstBps: p.gstBps,
                    })
                  }
                />
              ))
            : null}
          {tab === 'packages'
            ? filteredPackages.map((p) => (
                <CatalogTile
                  key={p.id}
                  title={p.name}
                  meta="Package"
                  pricePaise={p.pricePaise}
                  onPick={() =>
                    addToCart({
                      kind: 'package',
                      refId: p.id,
                      name: p.name,
                      unitPricePaise: p.pricePaise,
                      gstBps: 0,
                    })
                  }
                />
              ))
            : null}
          {tab === 'memberships'
            ? filteredMemberships.map((p) => (
                <CatalogTile
                  key={p.id}
                  title={p.name}
                  meta="Membership"
                  pricePaise={p.pricePaise}
                  onPick={() =>
                    addToCart({
                      kind: 'membership',
                      refId: p.id,
                      name: p.name,
                      unitPricePaise: p.pricePaise,
                      gstBps: 0,
                    })
                  }
                />
              ))
            : null}
        </div>
      </div>

      <aside className="fyh-glass flex w-full flex-col gap-4 p-4 lg:sticky lg:top-4 lg:w-[min(420px,38%)] lg:self-start">
        <h2 className="fyh-display text-lg font-semibold">Cart</h2>
        {cart.length === 0 ? (
          <p className="py-8 text-center text-sm text-fyh-text-muted">Tap items to add</p>
        ) : (
          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {cart.map((line) => (
              <li key={line.key} className="rounded-xl border border-[color:var(--fyh-border)] p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-fyh-text">{line.name}</p>
                  <button
                    type="button"
                    className="text-xs text-fyh-danger"
                    onClick={() => setCart((c) => c.filter((x) => x.key !== line.key))}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-fyh-text-muted">
                    Qty
                    <Input
                      type="number"
                      min={0.001}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => {
                        const quantity = Number(e.target.value) || 1;
                        setCart((c) =>
                          c.map((x) => {
                            if (x.key !== line.key) return x;
                            const gross = lineGrossPaise({ ...x, quantity });
                            return {
                              ...x,
                              quantity,
                              lineDiscountPaise: discountPaiseFromBps(gross, x.lineDiscountBps),
                            };
                          }),
                        );
                      }}
                      className="mt-1 h-9"
                    />
                  </label>
                  <label className="text-xs text-fyh-text-muted">
                    Discount %
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={line.lineDiscountBps / 100}
                      onChange={(e) => {
                        const bps = Math.round(Number(e.target.value || 0) * 100);
                        setCart((c) =>
                          c.map((x) => {
                            if (x.key !== line.key) return x;
                            const gross = lineGrossPaise(x);
                            return {
                              ...x,
                              lineDiscountBps: bps,
                              lineDiscountPaise: discountPaiseFromBps(gross, bps),
                            };
                          }),
                        );
                      }}
                      className="mt-1 h-9"
                    />
                  </label>
                  <label className="col-span-2 text-xs text-fyh-text-muted">
                    Discount ₹
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={line.lineDiscountPaise / 100}
                      onChange={(e) => {
                        const lineDiscountPaise = Math.round(Number(e.target.value || 0) * 100);
                        setCart((c) =>
                          c.map((x) => {
                            if (x.key !== line.key) return x;
                            const gross = lineGrossPaise(x);
                            return {
                              ...x,
                              lineDiscountPaise,
                              lineDiscountBps: discountBpsFromPaise(gross, lineDiscountPaise),
                            };
                          }),
                        );
                      }}
                      className="mt-1 h-9"
                    />
                  </label>
                </div>
                {line.kind === 'service' ? (
                  <div className="mt-3 space-y-2">
                    <ServicedByMulti
                      staff={line.servicedBy}
                      onChange={(servicedBy) =>
                        setCart((c) => c.map((x) => (x.key === line.key ? { ...x, servicedBy } : x)))
                      }
                    />
                    {line.servicedBy.length > 0 ? (
                      <ul className="text-xs text-fyh-text-muted">
                        {(() => {
                          const net = Math.max(
                            0,
                            line.unitPricePaise * line.quantity - line.lineDiscountPaise,
                          );
                          const shares = normalizeEqualShares(line.servicedBy.map((s) => s.id));
                          return line.servicedBy.map((s) => {
                            const shareBps =
                              shares.find((x) => x.staffId === s.id)?.shareBps ?? 10_000;
                            const share = attributedNetForShare(net, shareBps);
                            return (
                              <li key={s.id} className="flex justify-between tabular-nums">
                                <span>{s.fullName}</span>
                                <span>{formatInrFromPaise(share)}</span>
                              </li>
                            );
                          });
                        })()}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3">
                    <StaffTypeahead
                      label="Sold by"
                      value={line.soldBy}
                      onPick={(soldBy) =>
                        setCart((c) => c.map((x) => (x.key === line.key ? { ...x, soldBy } : x)))
                      }
                    />
                  </div>
                )}
                <p className="mt-2 text-right tabular-nums text-fyh-accent">
                  {formatInrFromPaise(
                    Math.max(0, line.unitPricePaise * line.quantity - line.lineDiscountPaise),
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1 border-t border-[color:var(--fyh-border)] pt-3 text-sm">
          <Row label="Subtotal" value={formatInrFromPaise(localTotals.subtotalPaise)} />
          <Row label="Tax" value={formatInrFromPaise(localTotals.taxPaise)} />
          {membershipDiscountPaise > 0 ? (
            <Row label="Membership" value={`−${formatInrFromPaise(membershipDiscountPaise)}`} />
          ) : null}
          <label className="flex items-center justify-between gap-2 text-fyh-text-muted">
            Invoice discount ₹
            <Input
              className="h-9 w-28"
              type="number"
              min={0}
              value={invoiceDiscountPaise / 100}
              onChange={(e) => setInvoiceDiscountPaise(Math.round(Number(e.target.value || 0) * 100))}
            />
          </label>
          {availableWalletPaise > 0 ? (
            <label className="flex items-center justify-between gap-2 text-fyh-text-muted">
              Wallet use ₹
              <Input
                className="h-9 w-28"
                type="number"
                min={0}
                max={availableWalletPaise / 100}
                value={walletRedeemPaise / 100}
                onChange={(e) =>
                  setWalletRedeemPaise(
                    Math.min(
                      availableWalletPaise,
                      Math.round(Number(e.target.value || 0) * 100),
                    ),
                  )
                }
              />
            </label>
          ) : null}
          <label className="flex items-center justify-between gap-2 text-fyh-text-muted">
            Tip ₹
            <Input
              className="h-9 w-28"
              type="number"
              min={0}
              value={tipPaise / 100}
              onChange={(e) => setTipPaise(Math.round(Number(e.target.value || 0) * 100))}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-fyh-text-muted">
            Round off ₹
            <Input
              className="h-9 w-28"
              type="number"
              step={1}
              value={roundOffPaise / 100}
              onChange={(e) => setRoundOffPaise(Math.round(Number(e.target.value || 0) * 100))}
            />
          </label>
          <Row
            label="Total"
            value={formatInrFromPaise(grandTotal)}
            accent
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-fyh-text-muted">
            Cash ₹
            <Input value={payCash} onChange={(e) => setPayCash(e.target.value)} className="mt-1 h-10" />
          </label>
          <label className="text-xs text-fyh-text-muted">
            UPI ₹
            <Input value={payUpi} onChange={(e) => setPayUpi(e.target.value)} className="mt-1 h-10" />
          </label>
          <label className="text-xs text-fyh-text-muted">
            Card ₹
            <Input value={payCard} onChange={(e) => setPayCard(e.target.value)} className="mt-1 h-10" />
          </label>
          <label className="text-xs text-fyh-text-muted">
            Bank ₹
            <Input value={payBank} onChange={(e) => setPayBank(e.target.value)} className="mt-1 h-10" />
          </label>
          {availableWalletPaise > 0 ? (
            <label className="col-span-2 text-xs text-fyh-text-muted">
              Wallet pay ₹
              <Input
                value={payWallet}
                onChange={(e) => setPayWallet(e.target.value)}
                className="mt-1 h-10"
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !customer || cart.length === 0}
            className="h-12"
            onClick={() => {
              if (!customer) return;
              startTransition(async () => {
                setError(null);
                const res = await holdQuickSaleAction({
                  customerId: customer.id,
                  lines: cartToQuickSaleLines(cart),
                  holdInvoiceId,
                  posDraft: {
                    paymentDraft: paymentDraftFromFields({
                      payCash,
                      payUpi,
                      payCard,
                      payBank,
                      payWallet,
                    }),
                  },
                  discountPaise: invoiceDiscountPaise,
                  walletRedeemPaise,
                  tipPaise,
                  roundOffPaise,
                });
                if (res.error) setError(res.error);
                else {
                  setHoldInvoiceId(null);
                  resetForNext();
                }
              });
            }}
          >
            Hold bill
          </Button>
          <Button
            type="button"
            disabled={pending || !customer || cart.length === 0}
            className="h-12"
            onClick={() => {
              if (!customer) return;
              const payments: PaymentSplitInput[] = (
                [
                  { method: 'cash' as const, amountPaise: Math.round(Number(payCash || 0) * 100) },
                  { method: 'upi' as const, amountPaise: Math.round(Number(payUpi || 0) * 100) },
                  { method: 'card' as const, amountPaise: Math.round(Number(payCard || 0) * 100) },
                  { method: 'bank' as const, amountPaise: Math.round(Number(payBank || 0) * 100) },
                  { method: 'wallet' as const, amountPaise: Math.round(Number(payWallet || 0) * 100) },
                ] as PaymentSplitInput[]
              ).filter((p) => p.amountPaise > 0);

              startTransition(async () => {
                setError(null);
                const res = await completeQuickSaleAction({
                  customerId: customer.id,
                  lines: cartToQuickSaleLines(cart),
                  payments,
                  discountPaise: invoiceDiscountPaise,
                  walletRedeemPaise,
                  tipPaise,
                  roundOffPaise,
                  holdInvoiceId,
                });
                if (res.error) setError(res.error);
                else if (res.invoiceId) {
                  setHoldInvoiceId(null);
                  setInvoiceId(res.invoiceId);
                  setPrintHtml(res.printHtml ?? null);
                  setStep('done');
                }
              });
            }}
          >
            {pending ? 'Processing…' : 'Complete sale'}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${accent ? 'text-base font-semibold text-fyh-text' : ''}`}>
      <span className="text-fyh-text-muted">{label}</span>
      <span className={accent ? 'text-fyh-accent tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  );
}

function CatalogTile({
  title,
  meta,
  pricePaise,
  onPick,
}: {
  title: string;
  meta: string;
  pricePaise: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="rounded-2xl border border-[color:var(--fyh-border)] bg-black/10 px-4 py-4 text-left transition hover:border-fyh-accent/40 hover:bg-white/5"
    >
      <p className="font-medium text-fyh-text">{title}</p>
      {meta ? <p className="mt-0.5 text-xs text-fyh-text-muted">{meta}</p> : null}
      <p className="mt-2 tabular-nums text-fyh-accent">{formatInrFromPaise(pricePaise)}</p>
    </button>
  );
}

function QuickAddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: SelectedCustomer) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        className="fyh-glass w-full max-w-md space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            setError(null);
            const res = await createQuickCustomerAction({}, fd);
            if (res.error) setError(res.error);
            else if (res.customer) onCreated({ ...res.customer, walletBalancePaise: 0 });
          });
        }}
      >
        <h2 className="fyh-display text-xl font-semibold">Add customer</h2>
        <label className="block text-sm text-fyh-text-secondary">
          Customer name *
          <Input name="fullName" required className="mt-1 h-11" autoFocus />
        </label>
        <label className="block text-sm text-fyh-text-secondary">
          Phone number *
          <Input name="phone" required type="tel" className="mt-1 h-11" />
        </label>
        <label className="block text-sm text-fyh-text-secondary">
          Gender
          <select
            name="gender"
            defaultValue="female"
            className="mt-1 w-full rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2.5 text-sm"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
