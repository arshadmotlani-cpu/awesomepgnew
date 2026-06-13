import Link from 'next/link';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCheckCircle } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import {
  ADMIN_MODULES,
  moduleHref,
  moduleKycVerifyHref,
} from '@/src/lib/admin/navigation';
import { formatDateTime, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function ResidentsKycPage() {
  const rows = await listPendingKycSubmissions();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: 'KYC review' },
        ]}
      />
      <PageHeader
        title="KYC review"
        description="Pending uploads from residents. Click Verify to view photos and approve or reject."
      />

      <div className="mb-6">
        <KycStorageWarning />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconCheckCircle />}
          title="No pending KYC"
          description="New submissions appear here after residents upload from Account → Identity (KYC)."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Resident
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/residents/${r.customerId}`}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerName}
                      </Link>
                      <p className="text-xs text-apg-silver">{r.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-apg-silver">{r.customerPhone}</td>
                    <td className="px-4 py-3 text-apg-silver">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <AdminKycStatusWithWhatsApp
                        kycStatus="pending"
                        phone={r.customerPhone}
                        customerName={r.customerName}
                        badge={
                          <Badge tone={toneForStatus(r.status)}>
                            {titleCase(r.status)}
                          </Badge>
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={moduleKycVerifyHref(r.id)}
                        className="inline-flex rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Verify →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
