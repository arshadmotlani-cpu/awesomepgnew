import Link from 'next/link';
import { moduleHref } from '@/src/lib/admin/navigation';

type GuideSection = {
  title: string;
  status: 'live' | 'partial' | 'planned';
  summary: string;
  steps: string[];
  href?: string;
};

const SECTIONS: GuideSection[] = [
  {
    title: 'Scoped admin PG access',
    status: 'live',
    summary:
      'Managers with a PG scope can only act on bookings, deposits, vacating, and invoices for their assigned PGs. Cross-PG requests are denied.',
    steps: [
      'Sign in as a pg_manager scoped to PG-A only (Permissions tab shows role + scope).',
      'Open PG-B bed map or paste a PG-B booking ID into a form — action should fail with “Access denied for this PG.”',
      'On PG-A bed map: submit vacating or remove tenant — should succeed.',
      'Deposits, Collections, Vacating list, and Booking detail pages enforce the same scope.',
      'super_admin bypasses scope; empty pgScope on non–super_admin denies all PGs.',
    ],
    href: '/admin/pgs',
  },
  {
    title: 'Bed map vacating & remove tenant',
    status: 'live',
    summary:
      'Map-side vacating and remove-tenant actions now verify booking PG before calling services (closes cross-PG forgery via bookingId).',
    steps: [
      'PG listings → open PG → Bed map.',
      'Click an occupied bed → Start vacating → pick date → submit.',
      'Same panel → Remove tenant (when permitted) — confirm stay ends correctly.',
      'Scoped admin: repeat on own PG ✓ and another PG ✗.',
    ],
    href: '/admin/pgs',
  },
  {
    title: 'Deposit deduct & refund (canonical settlement)',
    status: 'live',
    summary:
      'All deposit deductions and refunds go through depositSettlement — row locks, balance checks, idempotency keys, and audit rows in deposit_settlements.',
    steps: [
      'Residents → check in → Deposits → open booking deposit page.',
      'Deduct an amount with reason → ledger balance decreases; cannot deduct more than balance.',
      'Refund (full or partial) → settlement row created; ledger shows refund entry.',
      'Complete vacating with deductions → settlement snapshot stored.',
      'Run npm test — depositSettlement tests must pass.',
    ],
    href: moduleHref('residents'),
  },
  {
    title: 'Payment link ownership',
    status: 'live',
    summary:
      'Residents must be signed in and match the link owner. Another resident cannot open or upload proof for someone else’s link.',
    steps: [
      'Admin generates payment link for Resident A (Residents or Collections → Link).',
      'Sign in as Resident A → open /pay/{linkId} → see QR + breakdown.',
      'Sign in as Resident B → open same URL → redirected or denied.',
      'Resident A uploads payment proof → succeeds; Resident B → “belongs to another resident.”',
      'Admin panel → Payment links tab confirms status.',
    ],
    href: '/admin/panel?tab=links',
  },
  {
    title: 'Offline booking payment approval',
    status: 'live',
    summary:
      'Admin-recorded offline payments must match expected amount unless super_admin with payments:override.',
    steps: [
      'Create a pending_payment booking → Admin → Booking detail.',
      'Record offline payment with wrong amount → rejected unless override role.',
      'Record exact amount → booking confirms; audit log entry created.',
    ],
    href: '/admin/bookings',
  },
  {
    title: 'Mock webhook (staging / dev only)',
    status: 'live',
    summary:
      'Mock payment webhooks require HMAC signature. Route returns 404 in production. Replay guard blocks duplicate signatures.',
    steps: [
      'Set MOCK_WEBHOOK_SECRET in staging (not required in production — route disabled).',
      'Unsigned POST to /api/webhooks/mock → 401.',
      'Signed POST with valid receipt → payment recorded once; duplicate signature rejected.',
      'Production deploy: confirm /api/webhooks/mock returns 404.',
    ],
  },
  {
    title: 'Vacating → deposit settlement',
    status: 'live',
    summary: 'Completing vacating runs canonical deposit settlement with deductions snapshot.',
    steps: [
      'Bed map or Vacating → create vacating request.',
      'Add deductions if applicable → Complete vacating.',
      'Deposits page → verify final refund and ledger entries.',
      'deposit_settlements table should have a row (source = vacating).',
    ],
    href: moduleHref('vacating'),
  },
  {
    title: 'Production environment & boot checks',
    status: 'live',
    summary:
      'App fails fast on startup if required secrets are missing in production Node runtime.',
    steps: [
      'Vercel production env: AUTH_SECRET, CRON_SECRET, BLOB_READ_WRITE_TOKEN.',
      'PAYMENT_PROVIDER=razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET for live payments.',
      'After deploy: check logs — no “Missing AUTH_SECRET” / similar boot errors.',
      'Staging: add MOCK_WEBHOOK_SECRET for mock provider testing.',
    ],
  },
  {
    title: 'Database migration 0052',
    status: 'live',
    summary:
      'Security hardening migration adds webhook_replay_guard and deposit_settlements tables.',
    steps: [
      'Before or immediately after deploy: npm run db:migrate.',
      'Confirm 0052_security_hardening applied (webhook_replay_guard, deposit_settlements).',
      'Re-run on staging first, then production.',
    ],
  },
];

const STATUS_LABEL: Record<GuideSection['status'], string> = {
  live: 'Live',
  partial: 'Partial',
  planned: 'Planned',
};

const STATUS_CLASS: Record<GuideSection['status'], string> = {
  live: 'bg-emerald-500/20 text-emerald-300',
  partial: 'bg-amber-500/20 text-amber-200',
  planned: 'bg-zinc-500/20 text-zinc-400',
};

/** Security hardening & deploy validation — companion to AdminPanelGuide (Guide 1). Commit 15406c6. */
export function AdminPanelGuide2() {
  return (
    <section className="mt-10 space-y-6 border-t border-white/10 pt-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver/60">
          Guide 2
        </p>
        <h2 className="text-lg font-semibold text-white">Security hardening & deploy checklist</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Validate the security remediation shipped after the ops guide (PG scope, deposit settlement,
          payment links, mock webhooks). Run on staging before production.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <article
            key={section.title}
            className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{section.title}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASS[section.status]}`}
              >
                {STATUS_LABEL[section.status]}
              </span>
            </div>
            <p className="mt-2 text-xs text-apg-silver">{section.summary}</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-apg-silver">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {section.href ? (
              <Link
                href={section.href}
                className="mt-3 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
              >
                Open →
              </Link>
            ) : null}
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <h3 className="text-sm font-semibold text-white">Pre-production gate</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-apg-silver">
          <li>
            <code className="text-emerald-200">npm run db:migrate</code> — 0052 applied in target env.
          </li>
          <li>
            <code className="text-emerald-200">npm test</code> — 330+ pass, 0 fail.
          </li>
          <li>Env vars set on Vercel (see Production environment section above).</li>
          <li>Deploy staging → run smoke tests below → then production.</li>
        </ol>
      </div>

      <div className="rounded-2xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-5">
        <h3 className="text-sm font-semibold text-white">Security smoke test (~10 min)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-apg-silver">
          <li>
            <strong className="text-white">Booking:</strong> create → pay via QR → approve → confirmed.
          </li>
          <li>
            <strong className="text-white">Deposit:</strong> check-in → collect → deduct → refund →
            balances correct.
          </li>
          <li>
            <strong className="text-white">Vacating:</strong> request → complete → settlement row exists.
          </li>
          <li>
            <strong className="text-white">Payment links:</strong> Resident A opens own link; Resident B
            blocked.
          </li>
          <li>
            <strong className="text-white">PG scope:</strong> scoped admin denied on another PG’s bed
            map action.
          </li>
          <li>
            <strong className="text-white">Mock webhook:</strong> unsigned POST → 401; no payment row
            created.
          </li>
        </ol>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
        <h3 className="text-xs font-semibold uppercase text-apg-silver">Known residual risks</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-apg-silver">
          <li>
            Some service functions (e.g. adminRemoveTenantFromBed) trust the action layer for PG scope
            — keep action guards when adding new callers.
          </li>
          <li>Manual partial deposit refunds use fresh idempotency keys — avoid double-click.</li>
          <li>Customer PII encryption at rest is planned (see schema TODO).</li>
        </ul>
      </div>

      <p className="text-[11px] text-apg-silver/70">
        Guide 1 covers ops stack (rent sync, WhatsApp, KYC, collections).{' '}
        <Link href="/admin/panel?tab=guide" className="text-[#FF5A1F] hover:underline">
          Open Guide 1 →
        </Link>{' '}
        Audit trail: commit <code className="text-apg-silver">15406c6</code>, docs SECURITY_FOLLOWUP.md.
      </p>
    </section>
  );
}
