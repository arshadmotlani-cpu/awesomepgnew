import Link from 'next/link';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';

type GuideSection = {
  title: string;
  status: 'live' | 'partial' | 'planned';
  summary: string;
  steps: string[];
  href?: string;
};

const SECTIONS: GuideSection[] = [
  {
    title: 'Rent edits sync everywhere',
    status: 'live',
    summary:
      'Edit monthly rent on a resident profile — audit log, pending invoices, action items, and Overview all update.',
    steps: [
      'Sidebar → Residents → open a resident with a bed assigned.',
      'Scroll to Assign / reassign bed → change Monthly rent (₹) → Save.',
      'After save: Rent updated WhatsApp + payment link appear in the success banner.',
      'Admin panel → Rent changes tab: see booking/rent_updated audit entry.',
      'Collections → Rent invoices: pending amounts should match new rent.',
      'Overview → Expected monthly rent card reflects booking snapshot (not bed list price).',
    ],
    href: moduleHref('residents'),
  },
  {
    title: 'WhatsApp + payment links',
    status: 'live',
    summary: 'Pre-filled WhatsApp messages with payment links on residents, collections, and deposits.',
    steps: [
      'Resident profile → orange Actions box → KYC WhatsApp, Rent WhatsApp, Payment link.',
      'Collections → Rent / Electricity tabs → Actions column on each row.',
      'Deposits → Actions column → Link + Profile.',
      'Payment link opens /pay/{id} with breakdown + UPI QR.',
      'Admin panel → Payment links tab: status active / paid / expired.',
      'Admin panel → WhatsApp log tab: messages prepared when links are generated.',
    ],
    href: '/admin/panel?tab=links',
  },
  {
    title: 'KYC review',
    status: 'live',
    summary: 'Pending queue + approved documents with photos.',
    steps: [
      'Sidebar → KYC review (below Residents).',
      'Pending tab → Verify → view photos → Approve / Reject.',
      'Approved documents tab → inline photos per resident.',
    ],
    href: '/admin/residents/kyc',
  },
  {
    title: 'Overview control board',
    status: 'live',
    summary: 'Clickable KPI cards — drill down to residents and act via drawer.',
    steps: [
      'Sidebar → Overview → scroll to Control board section.',
      'Click any card (Expected rent, Outstanding, KYC pending, etc.).',
      'Drawer opens with resident rows — WhatsApp, payment link, bulk actions.',
    ],
    href: moduleHref('overview'),
  },
  {
    title: 'Collections module',
    status: 'live',
    summary: 'Approval queue, rent invoices, electricity, paid history — each row has actions.',
    steps: [
      'Sidebar → Collections.',
      'Tabs: Approval queue | Rent invoices | Electricity | Paid history.',
      'Use WhatsApp + Link buttons on rent/electricity rows.',
    ],
    href: moduleHref('collections'),
  },
  {
    title: 'Payment link lifecycle',
    status: 'live',
    summary: 'Links start active; marked paid when rent payment lands; stale links expire after 30 days.',
    steps: [
      'Generate a link from resident or collections row.',
      'Status = active in Admin panel → Payment links.',
      'When rent invoice is paid (proof or webhook), matching active links → paid.',
      'Links older than 30 days → expired (refreshed when you open Admin panel).',
    ],
    href: '/admin/panel?tab=links',
  },
  {
    title: 'Date coupons (DDMMYY)',
    status: 'partial',
    summary: '10% off rent at booking checkout only — auto-generated from today\'s date (IST).',
    steps: [
      'Admin panel → Coupons tab: today\'s code + usage stats.',
      'Customer booking flow: enter DDMMYY coupon at checkout.',
      'Not yet applied to monthly rent invoices or payment links.',
    ],
    href: '/admin/panel?tab=coupons',
  },
  {
    title: 'Permissions',
    status: 'partial',
    summary: 'View admin users and roles — editing roles is read-only for now.',
    steps: [
      'Admin panel → Permissions tab.',
      'Contact super admin to change roles until editing ships.',
    ],
    href: '/admin/panel?tab=permissions',
  },
  {
    title: 'Operations action center',
    status: 'live',
    summary: 'Synced queue from rent, KYC, vacating — Sync now on Overview or Operations.',
    steps: [
      'Overview → Sync now (top right) or Operations page.',
      'Click action rows to open drawer with WhatsApp / payment link execution.',
    ],
    href: moduleHref('operations'),
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

export function AdminPanelGuide() {
  return (
    <section className="mt-10 space-y-6 border-t border-white/10 pt-8">
      <div>
        <h2 className="text-lg font-semibold text-white">Platform guide & test checklist</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Use this while testing the connected ops stack. Each section maps to a live feature — follow
          the steps in order when validating a deploy.
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

      <div className="rounded-2xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-5">
        <h3 className="text-sm font-semibold text-white">Quick smoke test (5 min)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-apg-silver">
          <li>
            Open{' '}
            <Link href="/admin/panel" className="text-[#FF5A1F] hover:underline">
              Admin panel
            </Link>{' '}
            — confirm tabs load.
          </li>
          <li>
            Open{' '}
            <Link href={moduleHref('residents')} className="text-[#FF5A1F] hover:underline">
              Residents
            </Link>{' '}
            → pick assigned resident → see Actions box.
          </li>
          <li>Click Payment link → open /pay/ URL → see QR + breakdown.</li>
          <li>Change rent → save → Rent updated WhatsApp appears.</li>
          <li>
            Open{' '}
            <Link href={moduleHref('overview')} className="text-[#FF5A1F] hover:underline">
              Overview
            </Link>{' '}
            → Control board → click Expected rent card.
          </li>
          <li>
            Open{' '}
            <Link href="/admin/residents/kyc" className="text-[#FF5A1F] hover:underline">
              KYC review
            </Link>{' '}
            → Approved documents tab.
          </li>
        </ol>
      </div>

      <p className="text-[11px] text-apg-silver/70">
        Sidebar order: Overview → Revenue → Collections → PGs → Residents → KYC review →
        Operations → Analytics → System health → {ADMIN_MODULES.panel.label}. On mobile use the ☰
        menu top-left.
      </p>
    </section>
  );
}
