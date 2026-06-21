import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { loadBedAuditReport } from './actions';
import { RepairBedIssueButton } from './RepairBedIssueButton';

export const dynamic = 'force-dynamic';

export default async function BedAuditPage() {
  const { bedAudit, ghostAudit } = await loadBedAuditReport();
  const totalIssues = bedAudit.issues.length + ghostAudit.ghostIssues.length;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Bed audit' },
        ]}
      />
      <PageHeader
        title="Bed & invoice audit"
        description="Detect ghost bookings, orphan invoices, and occupancy mismatches."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
          <p className="text-xs text-apg-muted">Total issues</p>
          <p className="mt-1 text-2xl font-semibold text-white">{ghostAudit.summary.totalIssues}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
          <p className="text-xs text-apg-muted">Assigned, no invoice</p>
          <p className="mt-1 text-2xl font-semibold text-white">{ghostAudit.summary.assignedNoInvoice}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
          <p className="text-xs text-apg-muted">Invoice without booking</p>
          <p className="mt-1 text-2xl font-semibold text-white">{ghostAudit.summary.invoiceNoBooking}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
          <p className="text-xs text-apg-muted">Booking without invoice</p>
          <p className="mt-1 text-2xl font-semibold text-white">{ghostAudit.summary.bookingNoInvoice}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Badge tone={totalIssues === 0 ? 'emerald' : 'amber'}>
          {totalIssues === 0 ? 'No issues' : `${totalIssues} issue(s)`}
        </Badge>
        <span className="text-xs text-apg-silver">
          {bedAudit.bedsChecked} beds checked · as of {ghostAudit.asOf}
        </span>
      </div>

      {ghostAudit.ghostIssues.length > 0 ? (
        <>
          <h2 className="mb-2 text-sm font-semibold text-white">Invoice ↔ booking mismatches</h2>
          <div className="mb-8 overflow-hidden rounded-xl border border-white/10">
            <Table>
              <THead>
                <TR>
                  <TH>Issue</TH>
                  <TH>Detail</TH>
                  <TH>Booking / invoice</TH>
                  <TH>Resident</TH>
                </TR>
              </THead>
              <TBody>
                {ghostAudit.ghostIssues.map((issue, i) => (
                  <TR key={`ghost-${issue.kind}-${i}`}>
                    <TD className="text-xs capitalize text-white">{issue.kind.replace(/_/g, ' ')}</TD>
                    <TD className="max-w-md text-xs text-apg-silver">{issue.detail}</TD>
                    <TD className="text-xs text-apg-silver">
                      {issue.bookingCode ?? issue.invoiceNumber ?? '—'}
                    </TD>
                    <TD className="text-xs">
                      {issue.customerId ? (
                        <Link
                          href={`/admin/residents/${issue.customerId}`}
                          className="text-[#FF5A1F] hover:underline"
                        >
                          {issue.customerName ?? 'View'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-white">Bed occupancy audit</h2>
      {bedAudit.issues.length === 0 ? (
        <p className="text-sm text-apg-silver">All beds align with active confirmed reservations.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Issue</TH>
                <TH>PG · Bed</TH>
                <TH>Detail</TH>
                <TH>Resident</TH>
                <TH className="text-right">Repair</TH>
              </TR>
            </THead>
            <TBody>
              {bedAudit.issues.map((issue, i) => (
                <TR key={`${issue.kind}-${issue.bedId}-${i}`}>
                  <TD className="text-xs capitalize text-white">{issue.kind.replace(/_/g, ' ')}</TD>
                  <TD className="text-xs text-apg-silver">
                    {issue.pgName !== '—' ? (
                      <>
                        {issue.pgName} · R{issue.roomNumber}/{issue.bedCode}
                      </>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="max-w-xs text-xs text-apg-silver">{issue.detail}</TD>
                  <TD className="text-xs">
                    {issue.customerId ? (
                      <Link href={`/admin/residents/${issue.customerId}`} className="text-[#FF5A1F] hover:underline">
                        {issue.customerName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="text-right">
                    {['ghost_occupied', 'missing_assignment', 'double_assignment'].includes(
                      issue.kind,
                    ) ? (
                      <RepairBedIssueButton issue={issue} />
                    ) : (
                      '—'
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}
