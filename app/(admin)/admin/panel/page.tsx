import Link from 'next/link';
import { DateCouponAdminPanel } from '@/src/components/admin/DateCouponAdminPanel';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import {
  listAdminUsersForPanel,
  listRentChangeAuditLogs,
  loadPaymentLinksPanel,
} from '@/src/services/adminPanel';
import { getDateCouponAdminSnapshot } from '@/src/services/dateCouponAdmin';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'controls', label: 'Controls' },
  { id: 'audit', label: 'Rent changes' },
  { id: 'links', label: 'Payment links' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'permissions', label: 'Permissions' },
] as const;

export default async function AdminPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminSession('/admin/panel');
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : 'controls';

  const [auditLogs, paymentLinks, admins, couponSnapshot] = await Promise.all([
    listRentChangeAuditLogs(),
    loadPaymentLinksPanel(),
    listAdminUsersForPanel(),
    getDateCouponAdminSnapshot(),
  ]);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.panel.label },
        ]}
      />
      <PageHeader
        title="Admin panel"
        description="Operational controls — rent audit, payment links, coupons, and permissions. Changes sync across Overview, Collections, and Residents."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/panel?tab=${t.id}`}
            className={
              'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
              (tab === t.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white')
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'controls' ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Edit rent rules', 'Residents → open profile → monthly rent field', moduleHref('residents')],
            ['Rent change audit', `${auditLogs.length} logged events`, '/admin/panel?tab=audit'],
            ['Payment link generator', 'Resident profile → Payment link button', moduleHref('residents')],
            ['WhatsApp templates', 'Auto-filled on rent, KYC, and payment actions', '/admin/residents/kyc'],
            ['Collections queue', 'Pending proofs and invoices', moduleHref('collections')],
            ['Action center sync', 'Operations → Sync now', moduleHref('operations')],
          ].map(([title, desc, href]) => (
            <Link
              key={String(title)}
              href={href}
              className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4 hover:border-[#FF5A1F]/40"
            >
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs text-apg-silver">{desc}</p>
            </Link>
          ))}
        </section>
      ) : null}

      {tab === 'audit' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">When</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Action</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Entity</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-apg-silver">
                      No rent changes logged yet. Edit rent on a resident profile to start the audit trail.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-apg-silver">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-3 text-white">{titleCase(row.action.replace(/_/g, ' '))}</td>
                      <td className="px-4 py-3 font-mono text-xs text-apg-silver">
                        {row.entity}/{row.entityId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-xs text-apg-silver">
                        <pre className="max-w-md whitespace-pre-wrap">{JSON.stringify(row.diff, null, 0)}</pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'links' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Created</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Resident</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">PG</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Purpose</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Amount</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paymentLinks.map((link) => (
                  <tr key={link.id}>
                    <td className="px-4 py-3 text-apg-silver">{formatDateTime(link.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/residents/${link.residentId}`} className="text-white hover:text-[#FF5A1F]">
                        {link.residentName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-apg-silver">{link.pgName}</td>
                    <td className="px-4 py-3 text-apg-silver">{titleCase(link.purpose)}</td>
                    <td className="px-4 py-3 text-white">{paiseToInr(link.amount)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={link.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#FF5A1F] hover:underline"
                      >
                        Open →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'coupons' ? (
        <DateCouponAdminPanel {...couponSnapshot} />
      ) : null}

      {tab === 'permissions' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <p className="border-b border-white/10 px-4 py-3 text-xs text-apg-silver">
            Read-only list. Role editing ships in a later phase — contact super admin for access changes.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Name</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Email</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Role</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-white">{a.fullName}</td>
                    <td className="px-4 py-3 text-apg-silver">{a.email}</td>
                    <td className="px-4 py-3 text-apg-silver">{titleCase(a.role.replace(/_/g, ' '))}</td>
                    <td className="px-4 py-3 text-apg-silver">{a.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
