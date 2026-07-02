import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { AUTH_INTEGRITY_CHECK_TYPES } from '@/src/services/authIntegrityCheck';
import { loadAuthIntegrityReport } from './actions';
import { RepairAuthIssueButton } from './RepairAuthIssueButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function AuthIntegrityPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; email?: string; name?: string }>;
}) {
  const sp = await searchParams;
  await requireAdminSession('/admin/system/auth-integrity');
  const { report, profiles } = await loadAuthIntegrityReport({
    phone: sp.phone,
    email: sp.email,
    name: sp.name,
  });

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Auth integrity' },
        ]}
      />
      <PageHeader
        title="Resident auth integrity"
        description="Detect duplicate phones/emails, split identities, and orphan auth records."
      />

      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <input
          name="name"
          placeholder="Name"
          defaultValue={sp.name ?? ''}
          className="rounded border border-white/10 bg-[#12161C] px-3 py-1.5 text-xs text-white"
        />
        <input
          name="phone"
          placeholder="Phone"
          defaultValue={sp.phone ?? ''}
          className="rounded border border-white/10 bg-[#12161C] px-3 py-1.5 text-xs text-white"
        />
        <input
          name="email"
          placeholder="Email"
          defaultValue={sp.email ?? ''}
          className="rounded border border-white/10 bg-[#12161C] px-3 py-1.5 text-xs text-white"
        />
        <button
          type="submit"
          className="rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-3 py-1.5 text-xs font-medium text-[#FF5A1F]"
        >
          Search
        </button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.summary.issueCount === 0 ? 'emerald' : 'rose'}>
          {report.summary.issueCount === 0 ? 'No issues' : `${report.summary.issueCount} issue(s)`}
        </Badge>
        <span className="text-xs text-apg-silver">As of {report.asOf}</span>
      </div>

      {profiles.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-white">Matching residents</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Password</TH>
                  <TH>Bookings</TH>
                </TR>
              </THead>
              <TBody>
                {profiles.map((p: Record<string, unknown>) => (
                  <TR key={String(p.id)}>
                    <TD className="text-xs text-white">{String(p.full_name)}</TD>
                    <TD className="text-xs text-apg-silver">{String(p.email)}</TD>
                    <TD className="text-xs text-apg-silver">{String(p.phone)}</TD>
                    <TD className="text-xs text-apg-silver">
                      {p.has_password ? 'yes' : 'no'}
                      {p.must_set_password ? ' (must set)' : ''}
                    </TD>
                    <TD className="text-xs text-apg-silver">
                      {String(p.booking_count)} · {String(p.latest_booking_code ?? '—')}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      ) : null}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AUTH_INTEGRITY_CHECK_TYPES.map((type) => (
          <div key={type} className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
            <p className="text-[10px] uppercase tracking-wide text-apg-muted">
              {type.replace(/_/g, ' ')}
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {report.summary.byCheckType[type]}
            </p>
          </div>
        ))}
      </div>

      {report.issues.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Check</TH>
                <TH>Resident</TH>
                <TH>Detail</TH>
                <TH>Repair</TH>
              </TR>
            </THead>
            <TBody>
              {report.issues.map((issue, i) => (
                <TR key={`${issue.checkType}-${i}`}>
                  <TD className="text-xs text-white">{issue.checkType.replace(/_/g, ' ')}</TD>
                  <TD className="text-xs text-apg-silver">
                    {issue.customerName}
                    <span className="block text-[10px]">
                      {issue.email} · {issue.phone}
                    </span>
                  </TD>
                  <TD className="max-w-lg text-xs text-apg-silver">{issue.detail}</TD>
                  <TD>
                    <RepairAuthIssueButton issue={issue} />
                    {!issue.autoRepairable ? (
                      <span className="text-[10px] text-amber-300">Manual</span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-apg-silver">No auth integrity issues detected.</p>
      )}

      <p className="mt-6 text-xs text-apg-silver">
        Repairs merge bookings onto the canonical customer and archive duplicate rows — never delete
        booking history. Run against production with{' '}
        <code className="text-white/80">npx tsx scripts/investigate-room102-harshal.ts</code> for
        field investigations.
      </p>
    </>
  );
}
