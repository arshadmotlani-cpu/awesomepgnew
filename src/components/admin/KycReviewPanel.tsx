import Link from 'next/link';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCheckCircle } from '@/src/components/admin/icons';
import {
  KYC_DOCUMENT_LABELS,
  kycDocumentUrl,
  type KycDocumentKind,
} from '@/src/lib/kyc/documentUrls';
import { moduleKycVerifyHref } from '@/src/lib/admin/navigation';
import { formatDateTime, titleCase } from '@/src/lib/format';
import type { KycSubmissionListRow } from '@/src/services/kyc';

const SURFACE = 'overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]';
const DOC_KINDS: KycDocumentKind[] = ['aadhaar_front', 'aadhaar_back', 'selfie'];

export const KYC_REVIEW_TABS = [
  { id: 'pending', label: 'Needs review' },
  { id: 'approved', label: 'Approved on file' },
] as const;

export type KycReviewTabId = (typeof KYC_REVIEW_TABS)[number]['id'];

export function KycReviewTabs({
  activeTab,
  showAllTab = false,
  allActive = false,
}: {
  activeTab: KycReviewTabId;
  showAllTab?: boolean;
  allActive?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {showAllTab ? (
        <TabPill href="/admin/residents/kyc" active={allActive} label="All submissions" />
      ) : null}
      {KYC_REVIEW_TABS.map((t) => (
        <TabPill
          key={t.id}
          href={`/admin/residents/kyc?tab=${t.id}`}
          active={!allActive && activeTab === t.id}
          label={t.label}
        />
      ))}
    </div>
  );
}

function TabPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
        (active
          ? 'bg-[#FF5A1F] text-white'
          : 'border border-white/10 text-apg-silver hover:text-white')
      }
    >
      {label}
    </Link>
  );
}

export function KycPendingQueue({ rows }: { rows: KycSubmissionListRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconCheckCircle />}
        title="No pending KYC"
        description="New submissions appear here after residents upload from Account → Identity (KYC)."
      />
    );
  }

  return (
    <div className={SURFACE}>
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
                <td className="px-4 py-3 text-apg-silver">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <AdminKycStatusWithWhatsApp
                    kycStatus="pending"
                    phone={r.customerPhone}
                    customerName={r.customerName}
                    badge={
                      <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                    }
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={moduleKycVerifyHref(r.id)}
                    className="inline-flex rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                  >
                    Review documents
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KycApprovedDocuments({ rows }: { rows: KycSubmissionListRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconCheckCircle />}
        title="No approved KYC yet"
        description="After you approve a submission, it appears here with document photos for reference."
      />
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <article key={r.id} className={`${SURFACE} p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={`/admin/residents/${r.customerId}`}
                className="text-base font-semibold text-white hover:text-[#FF5A1F]"
              >
                {r.customerName}
              </Link>
              <p className="mt-0.5 text-sm text-apg-silver">
                {r.customerPhone} · {r.customerEmail}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-apg-silver">
                <Badge tone="emerald">Approved</Badge>
                <span>Submitted {formatDateTime(r.createdAt)}</span>
                {r.reviewedAt ? <span>· Approved {formatDateTime(r.reviewedAt)}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={moduleKycVerifyHref(r.id)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
              >
                Open full view
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DOC_KINDS.map((kind) => (
              <figure
                key={kind}
                className="overflow-hidden rounded-lg border border-white/10 bg-black/20"
              >
                <figcaption className="border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
                  {KYC_DOCUMENT_LABELS[kind]}
                </figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={kycDocumentUrl(r.id, kind)}
                  alt={`${r.customerName} — ${KYC_DOCUMENT_LABELS[kind]}`}
                  className="aspect-[4/3] w-full object-contain"
                  loading="lazy"
                />
              </figure>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
