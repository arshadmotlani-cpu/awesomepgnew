import Link from 'next/link';
import type { ReactNode } from 'react';
import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositSettlementPanel } from '@/src/components/admin/DepositSettlementPanel';
import { DepositWalletAdminPanel } from '@/src/components/admin/deposits/DepositWalletAdminPanel';
import { DepositComponentBoundary } from '@/src/components/admin/deposits/DepositComponentBoundary';
import { Badge } from '@/src/components/admin/Badge';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { paiseToInr } from '@/src/lib/format';
import {
  inspectProps,
  loadDepositPageData,
  logPropInspection,
} from '@/src/lib/deposits/loadDepositPageData';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import {
  auditSerialization,
  logDepositComponentFailed,
  logDepositComponentRender,
  throwSite,
  type DepositInvestigationContext,
  type SerializationAudit,
} from '@/src/lib/depositInvestigation';

export const dynamic = 'force-dynamic';

type SectionResult =
  | { ok: true; node: ReactNode; audit: SerializationAudit | null }
  | {
      ok: false;
      error: string;
      stack: string | null;
      file: string | null;
      line: number | null;
      audit: SerializationAudit | null;
    };

function runSection(
  ctx: DepositInvestigationContext,
  props: unknown,
  fn: () => ReactNode,
): SectionResult {
  const audit = props != null ? auditSerialization(props) : null;
  try {
    logDepositComponentRender(ctx, {
      props: props != null ? jsonSafe(props) : null,
      serialization: audit,
    });
    const node = fn();
    return { ok: true, node, audit };
  } catch (error) {
    logDepositComponentFailed(ctx, error, {
      props: props != null ? jsonSafe(props) : null,
      serialization: audit,
    });
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? null : null;
    const site = throwSite(error);
    return { ok: false, error: message, stack, file: site.file, line: site.line, audit };
  }
}

function AuditPanel({ audit, props }: { audit: SerializationAudit | null; props?: unknown }) {
  if (!audit) return null;
  const propFields = props != null ? inspectProps(props, 'props') : [];
  return (
    <details className="mt-3 rounded border border-white/10 bg-black/30 p-2">
      <summary className="cursor-pointer text-xs font-semibold text-apg-silver">
        Serialization audit —{' '}
        <span className={audit.jsonSerializable ? 'text-emerald-300' : 'text-rose-300'}>
          {audit.jsonSerializable ? 'PASS' : 'FAIL'}
        </span>
      </summary>
      <dl className="mt-2 grid gap-1 text-[10px] text-apg-silver sm:grid-cols-2">
        <div>
          <dt>JSON serializable</dt>
          <dd className={audit.jsonSerializable ? 'text-emerald-300' : 'text-rose-300'}>
            {String(audit.jsonSerializable)}
            {audit.jsonError ? ` — ${audit.jsonError}` : ''}
          </dd>
        </div>
        <div>
          <dt>BigInt fields</dt>
          <dd className={audit.bigints.length ? 'text-rose-300' : 'text-emerald-300'}>
            {audit.bigints.length ? audit.bigints.map((b) => b.path).join(', ') : 'none'}
          </dd>
        </div>
        <div>
          <dt>Undefined fields</dt>
          <dd className={audit.undefinedPaths.length ? 'text-amber-300' : 'text-emerald-300'}>
            {audit.undefinedPaths.length ? audit.undefinedPaths.join(', ') : 'none'}
          </dd>
        </div>
        <div>
          <dt>Circular reference</dt>
          <dd className={audit.hasCircularReference ? 'text-rose-300' : 'text-emerald-300'}>
            {String(audit.hasCircularReference)}
          </dd>
        </div>
      </dl>
      {propFields.length > 0 ? (
        <pre className="mt-2 max-h-48 overflow-auto text-[10px] text-apg-silver">
          {JSON.stringify(propFields, null, 2)}
        </pre>
      ) : null}
      {props != null ? (
        <pre className="mt-2 max-h-48 overflow-auto text-[10px] text-apg-silver">
          {JSON.stringify(jsonSafe(props), null, 2)}
        </pre>
      ) : null}
    </details>
  );
}

function SectionPanel({
  title,
  component,
  result,
}: {
  title: string;
  component: string;
  result: SectionResult;
}) {
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
        {title} — {component}
      </h2>
      {result.ok ? (
        <p className="mt-1 text-xs text-emerald-300">[DEPOSIT_COMPONENT_RENDER] PASS</p>
      ) : (
        <div className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <p className="font-semibold">[DEPOSIT_COMPONENT_FAILED]</p>
          <p className="mt-1">Component: {component}</p>
          <p className="mt-1">ERROR: {result.error}</p>
          {result.file ? (
            <p className="mt-1">
              FILE: {result.file}:{result.line}
            </p>
          ) : null}
          {result.stack ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-rose-200/90">
              {result.stack}
            </pre>
          ) : null}
        </div>
      )}
      <AuditPanel audit={result.audit} />
      {result.ok ? <div className="mt-4">{result.node}</div> : null}
    </section>
  );
}

export default async function DepositDebugPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const data = await loadDepositPageData(bookingId);

  const ctx: DepositInvestigationContext = {
    bookingId,
    bookingCode: data.booking?.bookingCode ?? null,
    customerId: data.customerId,
  };

  const bookingSection = runSection(
    { ...ctx, component: 'PageHeader' },
    data.booking,
    () => {
      if (!data.booking) throw new Error('booking is null');
      return (
        <PageHeader
          title={`Debug — ${data.booking.customerFullName}`}
          description={`${data.booking.bookingCode} · ${data.booking.customerPhone}`}
        />
      );
    },
  );

  const invoiceSection = runSection(
    { ...ctx, component: 'InvoiceBadge' },
    data.invoice,
    () =>
      data.invoice ? (
        <>
          <Badge tone="emerald">{data.invoice.displayStatus}</Badge>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-2 text-[10px] text-apg-silver">
            {JSON.stringify(jsonSafe(data.invoice), null, 2)}
          </pre>
        </>
      ) : (
        <p className="text-sm text-amber-200">invoice is null (missing or filtered out)</p>
      ),
  );

  const pricingSection = runSection(
    { ...ctx, component: 'PricingStatGrid' },
    {
      requiredPaise: data.requiredPaise,
      collectedPaise: data.collectedPaise,
      websiteDepositPaise: data.websiteDepositPaise,
    },
    () => (
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-apg-silver">Required</dt>
          <dd>{paiseToInr(data.requiredPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Collected</dt>
          <dd>{paiseToInr(data.collectedPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Website default</dt>
          <dd>{paiseToInr(data.websiteDepositPaise)}</dd>
        </div>
      </dl>
    ),
  );

  const refundsSection = runSection(
    { ...ctx, component: 'DepositRefundNotice' },
    {},
    () => (
      <DepositComponentBoundary
        bookingId={bookingId}
        bookingCode={ctx.bookingCode}
        customerId={ctx.customerId}
        component="DepositRefundNotice"
        sourceFile="src/components/customer/DepositRefundNotice.tsx"
      >
        <DepositRefundNotice />
      </DepositComponentBoundary>
    ),
  );

  const walletSection = runSection(
    { ...ctx, component: 'DepositWalletAdminPanel' },
    data.walletProps,
    () => {
      if (!data.walletProps) throw new Error('walletProps is null (unifiedView missing)');
      return (
        <DepositComponentBoundary
          bookingId={bookingId}
          bookingCode={ctx.bookingCode}
          customerId={ctx.customerId}
          component="DepositWalletAdminPanel"
          sourceFile="src/components/admin/deposits/DepositWalletAdminPanel.tsx"
          data={jsonSafe(data.walletProps)}
        >
          <DepositWalletAdminPanel {...data.walletProps} />
        </DepositComponentBoundary>
      );
    },
  );

  const adjustmentsSection = runSection(
    { ...ctx, component: 'DepositAdjustForms' },
    data.adjustProps,
    () => {
      if (!data.adjustProps) throw new Error('adjustProps is null');
      return (
        <DepositComponentBoundary
          bookingId={bookingId}
          bookingCode={ctx.bookingCode}
          customerId={ctx.customerId}
          component="DepositAdjustForms"
          sourceFile="src/components/admin/DepositAdjustForms.tsx"
          data={jsonSafe(data.adjustProps)}
        >
          <DepositAdjustForms {...data.adjustProps} />
        </DepositComponentBoundary>
      );
    },
  );

  const settlementSection = runSection(
    { ...ctx, component: 'DepositSettlementPanel' },
    data.settlementProps,
    () => {
      if (!data.settlementProps) {
        return (
          <p className="text-sm text-apg-silver">
            settlementProps is null (not shown on main page either)
          </p>
        );
      }
      return (
        <DepositComponentBoundary
          bookingId={bookingId}
          bookingCode={ctx.bookingCode}
          customerId={ctx.customerId}
          component="DepositSettlementPanel"
          sourceFile="src/components/admin/DepositSettlementPanel.tsx"
          data={jsonSafe(data.settlementProps)}
        >
          <DepositSettlementPanel {...data.settlementProps} />
        </DepositComponentBoundary>
      );
    },
  );

  logPropInspection('debug.walletProps', bookingId, data.walletProps);
  logPropInspection('debug.adjustProps', bookingId, data.adjustProps);
  logPropInspection('debug.settlementProps', bookingId, data.settlementProps);

  const sections = [
    { title: 'Booking', component: 'PageHeader', result: bookingSection },
    { title: 'Invoice', component: 'InvoiceBadge', result: invoiceSection },
    { title: 'Pricing', component: 'PricingStatGrid', result: pricingSection },
    { title: 'Refunds', component: 'DepositRefundNotice', result: refundsSection },
    { title: 'Wallet', component: 'DepositWalletAdminPanel', result: walletSection },
    { title: 'Adjustments', component: 'DepositAdjustForms', result: adjustmentsSection },
    { title: 'Settlement', component: 'DepositSettlementPanel', result: settlementSection },
  ];

  const passCount = sections.filter((s) => s.result.ok).length;

  return (
    <>
      <PageHeader
        title="Deposit debug"
        description={`Isolated section render — ${passCount}/${sections.length} sections pass`}
        actions={
          <Link
            href={`/admin/deposits/${bookingId}`}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-apg-silver hover:text-white"
          >
            ← Production deposit page
          </Link>
        }
      />
      {data.loadError ? (
        <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Loader partial error: {data.loadError}
        </p>
      ) : null}
      <div className="mb-6 grid gap-2 sm:grid-cols-4">
        {sections.map((s) => (
          <div
            key={s.component}
            className={`rounded-lg border px-3 py-2 text-xs ${
              s.result.ok
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-400/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            {s.component}: {s.result.ok ? 'PASS' : 'FAIL'}
          </div>
        ))}
      </div>
      <pre className="mb-6 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] text-apg-silver">
        {JSON.stringify(
          jsonSafe({
            bookingId,
            bookingCode: data.booking?.bookingCode,
            customerId: data.customerId,
            summary: data.summary ? auditSerialization(data.summary) : null,
            invoice: data.invoice ? auditSerialization(data.invoice) : null,
            unifiedView: data.unifiedView ? auditSerialization(data.unifiedView) : null,
            walletProps: data.walletProps ? auditSerialization(data.walletProps) : null,
          }),
          null,
          2,
        )}
      </pre>
      {sections.map((s) => (
        <SectionPanel
          key={s.component}
          title={s.title}
          component={s.component}
          result={s.result}
        />
      ))}
    </>
  );
}
