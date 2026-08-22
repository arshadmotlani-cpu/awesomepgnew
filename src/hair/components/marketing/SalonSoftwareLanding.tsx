import { SalonSoftwareWaitlistForm } from '@/src/hair/components/marketing/SalonSoftwareWaitlistForm';
import { FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

const FEATURES = [
  {
    title: 'Quick Sale (walk-in POS)',
    body: 'Express Sale for walk-in billing: customer search and quick add, catalog tabs (services, products, packages, memberships), line discounts, invoice discount, wallet, tip, round-off, split payments (cash, UPI, card, bank, wallet), and hold bill.',
  },
  {
    title: 'Advance payment',
    body: 'Wallet credit without an invoice, from the same 9-dot launcher as Quick Sale.',
  },
  {
    title: 'Appointments and Service Master',
    body: 'Salon-first service catalog (name, category, duration, selling price). Staff is chosen at appointment or Quick Sale — not on the service record. Categories: Hair, Skin, Makeup, Nails, Academy, Digital Production.',
  },
  {
    title: 'GST on billing',
    body: 'GST is applied automatically on save at a salon-wide 18% rate today (schema default 1800 bps). Per-salon Settings for rate is a later change — listed honestly, not as a finished multi-tenant tax engine.',
  },
  {
    title: 'Sales attribution and staff',
    body: 'Invoice line attributions (serviced by / sold by) drive staff performance reports. Workforce login, roles, and schedules sit beside the salon ERP.',
  },
  {
    title: 'Inventory, vendors, purchases',
    body: 'Stock, vendors, purchases, and expenses live in the ERP. Product stock consumption on Quick Sale pay is still a next phase in FEATURES.md.',
  },
] as const;

export function SalonSoftwareLanding() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-[color:var(--fyh-text)]">
      <p className="text-xs uppercase tracking-wide text-[color:var(--fyh-text-muted-token)]">{FYH_ERP.productLine}</p>
      <h1 className="mt-2 font-semibold text-3xl tracking-tight">{FYH_ERP.name} for your salon</h1>
      <p className="mt-3 text-base text-[color:var(--fyh-text-secondary-token)]">
        Walk-in POS, appointments, GST-aware invoices, staff attribution, and inventory — the same
        software we run in production. Self-serve accounts for other salons are not live yet. This page
        is a waitlist only.
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">What it does today</h2>
        <ul className="mt-4 grid gap-4">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="rounded-lg border border-[color:var(--fyh-border-token)] bg-[color:var(--fyh-surface)] p-4"
            >
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-[color:var(--fyh-text-secondary-token)]">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[color:var(--fyh-text-secondary-token)]">
          <li>Staff sign in on the salon host and land on the ERP (dashboard, Quick Sale, appointments).</li>
          <li>Walk-ins bill through Quick Sale; appointments bill through the appointment pay path.</li>
          <li>Money is stored as invoice lines, payments, and a financial ledger — not a second set of “SaaS” books.</li>
          <li>External salons cannot create a tenant from this page. Isolation work is documented in SAAS_READINESS.md and is not finished.</li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Pricing</h2>
        <p className="mt-2 text-sm text-[color:var(--fyh-warning)]">TBD — no public plan prices yet. Not a quote.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {['Starter', 'Salon', 'Group'].map((tier) => (
            <div
              key={tier}
              className="rounded-lg border border-dashed border-[color:var(--fyh-border-token)] p-4 text-sm"
            >
              <p className="font-medium">{tier}</p>
              <p className="mt-1 text-[color:var(--fyh-text-muted-token)]">TBD / month</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" id="waitlist">
        <h2 className="text-lg font-semibold">Waitlist</h2>
        <p className="mt-2 mb-4 text-sm text-[color:var(--fyh-text-secondary-token)]">
          Tell us your salon name and email. We store this in a dedicated waitlist table with no link to
          existing customers or invoices.
        </p>
        <SalonSoftwareWaitlistForm />
      </section>
    </main>
  );
}
