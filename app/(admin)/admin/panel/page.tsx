import Link from 'next/link';
import { AdminPanelGuide } from '@/src/components/admin/AdminPanelGuide';
import { DateCouponAdminPanel } from '@/src/components/admin/DateCouponAdminPanel';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { loadAdminPanelData } from '@/src/services/adminPanel';
import { getDateCouponAdminSnapshot } from '@/src/services/dateCouponAdmin';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'controls', label: 'Controls' },
  { id: 'guide', label: 'Guide & tests' },
  { id: 'audit', label: 'Rent changes' },
  { id: 'links', label: 'Payment links' },
  { id: 'whatsapp', label: 'WhatsApp log' },
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

  const [{ auditLogs, paymentLinks, admins, whatsappLogs }, couponSnapshot] =
    await Promise.all([loadAdminPanelData(), getDateCouponAdminSnapshot()]);

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
        description="Operational controls — rent audit, payment links, WhatsApp logs, coupons, permissions. Scroll down for the full test guide."
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
            ['Edit rent', 'Residents → profile → monthly rent', moduleHref('residents')],
            ['Rent audit', `${auditLogs.length} events`, '/admin/panel?tab=audit'],
            ['Payment links', `${paymentLinks.length} generated`, '/admin/panel?tab=links'],
            ['WhatsApp log', `${whatsappLogs.length} prepared messages`, '/admin/panel?tab=whatsapp'],
            ['Collections actions', 'Rent + electricity rows', moduleHref('collections')],
            ['Overview control board', 'Click KPI cards', moduleHref('overview')],
            ['KYC review', 'Pending + approved photos', '/admin/residents/kyc'],
            ['Sync action queue', 'Overview → Sync now', moduleHref('operations')],
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

      {tab === 'guide' ? <AdminPanelGuide /> : null}

      {tab === 'audit' ? (
        <AuditTable rows={auditLogs} empty="No rent changes yet — edit rent on a resident profile." />
      ) : null}

      {tab === 'links' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <p className="border-b border-white/10 px-4 py-2 text-xs text-apg-silver">
            Active → paid when rent lands · expired after 30 days without payment
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Created</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Resident</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">PG</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Purpose</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Amount</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Status</th>
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
                      <Badge tone={toneForStatus(link.status)}>{titleCase(link.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <a href={link.publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF5A1F] hover:underline">
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

      {tab === 'whatsapp' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <p className="border-b border-white/10 px-4 py-2 text-xs text-apg-silver">
            Logged when payment links are generated (message prepared for WhatsApp). Opening wa.me is on your device.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">When</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Kind</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Resident / phone</th>
                  <th className="px-4 py-3 text-xs uppercase text-apg-silver">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {whatsappLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-apg-silver">
                      No messages yet — generate a payment link from Residents or Collections.
                    </td>
                  </tr>
                ) : (
                  whatsappLogs.map((row) => {
                    const diff = row.diff as Record<string, unknown> | null;
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-apg-silver">{formatDateTime(row.createdAt)}</td>
                        <td className="px-4 py-3 text-white">{String(diff?.kind ?? '—')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-apg-silver">{row.entityId.slice(0, 20)}</td>
                        <td className="max-w-xs truncate px-4 py-3 text-xs text-apg-silver">
                          {String(diff?.messagePreview ?? '').slice(0, 80)}…
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'coupons' ? <DateCouponAdminPanel {...couponSnapshot} /> : null}

      {tab === 'permissions' ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <p className="border-b border-white/10 px-4 py-3 text-xs text-apg-silver">
            Read-only. Role editing ships in a later phase — contact super admin for access changes.
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

      {tab !== 'guide' ? <AdminPanelGuide /> : null}
    </>
  );
}

function AuditTable({
  rows,
  empty,
}: {
  rows: Array<{
    id: string;
    createdAt: Date;
    action: string;
    entity: string;
    entityId: string;
    diff: unknown;
  }>;
  empty: string;
}) {
  return (
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-apg-silver">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
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
  );
}
