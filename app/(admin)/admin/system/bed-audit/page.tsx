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
  const report = await loadBedAuditReport();

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
        title="Bed audit"
        description="Compare beds, bookings, reservations, and residents — repair ghost occupancy."
      />

      <div className="mb-4 flex items-center gap-3">
        <Badge tone={report.issues.length === 0 ? 'emerald' : 'amber'}>
          {report.issues.length === 0 ? 'No issues' : `${report.issues.length} issue(s)`}
        </Badge>
        <span className="text-xs text-apg-silver">{report.bedsChecked} beds checked</span>
      </div>

      {report.issues.length === 0 ? (
        <p className="text-sm text-apg-silver">All beds align with active reservations.</p>
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
              {report.issues.map((issue, i) => (
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
