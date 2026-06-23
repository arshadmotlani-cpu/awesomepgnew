import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  countOrphanUploadsForAdmin,
  listRecentResidentUploadsForAdmin,
} from '@/src/services/residentUploadEvents';

export const dynamic = 'force-dynamic';

function visibleTone(adminVisible: boolean) {
  return adminVisible ? ('emerald' as const) : ('rose' as const);
}

export default async function RecentResidentUploadsPage() {
  const session = await requireAdminSession('/admin/uploads');

  let rows;
  let orphanCount = 0;
  try {
    [rows, orphanCount] = await Promise.all([
      listRecentResidentUploadsForAdmin(session),
      countOrphanUploadsForAdmin(session),
    ]);
  } catch (err) {
    return (
      <>
        <PageHeader title="Recent resident uploads" />
        <DbStatusBanner
          error={err instanceof Error ? err.message : 'Unable to load upload audit.'}
        />
      </>
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Recent uploads' },
        ]}
      />
      <PageHeader
        title="Recent resident uploads"
        description="Every resident file upload in the last 30 days — including orphan uploads that never reached an admin queue because the follow-up submit step did not run."
        actions={
          <Link
            href="/admin/system"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            System health →
          </Link>
        }
      />

      {orphanCount > 0 ? (
        <div className="mb-6 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <strong>{orphanCount}</strong> upload{orphanCount === 1 ? '' : 's'} succeeded for the
          resident but are <strong>not visible to admin</strong> — the blob was stored but no
          review queue record was created. Contact the resident to resubmit or link manually.
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          No orphan uploads in the last 30 days — every traced upload is linked to an admin queue.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Upload type</TH>
              <TH>Uploaded at</TH>
              <TH>Status</TH>
              <TH>Visible to admin</TH>
              <TH>Admin queue</TH>
              <TH className="text-right">Open</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={7} className="text-center text-sm text-apg-silver">
                  No uploads in the last 30 days.
                </TD>
              </TR>
            ) : (
              rows.map((row) => (
                <TR
                  key={row.id}
                  className={!row.adminVisible ? 'bg-rose-500/[0.06]' : undefined}
                >
                  <TD>
                    <Link
                      href={`/admin/residents/${row.residentId}`}
                      className="text-sm font-medium text-white hover:text-[#FF5A1F]"
                    >
                      {row.residentName}
                    </Link>
                    {row.pgName ? (
                      <p className="text-[10px] text-apg-silver">{row.pgName}</p>
                    ) : null}
                  </TD>
                  <TD className="text-xs text-apg-silver">{row.uploadTypeLabel}</TD>
                  <TD className="text-xs tabular-nums text-apg-silver">
                    {new Intl.DateTimeFormat('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(row.uploadedAt)}
                  </TD>
                  <TD className="text-xs capitalize text-apg-silver">
                    {row.status.replace(/_/g, ' ')}
                  </TD>
                  <TD>
                    <Badge tone={visibleTone(row.adminVisible)}>
                      {row.adminVisible ? 'Yes' : 'No'}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-apg-silver">
                    {row.adminQueue?.replace(/_/g, ' ') ?? '—'}
                  </TD>
                  <TD className="text-right">
                    {row.adminHref ? (
                      <Link
                        href={row.adminHref}
                        className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                      >
                        Review →
                      </Link>
                    ) : (
                      <span className="text-[10px] text-apg-silver">Orphan</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs text-apg-silver">
        Orphan uploads (Visible = No) usually mean the resident uploaded a photo but did not tap the
        final Submit button. Payment proofs go to Billing → Collections; deposit refund photos go to
        Checkout settlements (or legacy Refund requests); KYC goes to KYC review.
      </p>
    </>
  );
}
