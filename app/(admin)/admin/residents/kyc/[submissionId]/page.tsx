import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { KycReviewActions } from '@/src/components/admin/KycReviewActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getKycSubmission } from '@/src/services/kyc';
import {
  ADMIN_MODULES,
  moduleHref,
  moduleKycVerifyHref,
} from '@/src/lib/admin/navigation';
import { formatDateTime, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

type RouteParams = { submissionId: string };

function docUrl(submissionId: string, kind: 'aadhaar_front' | 'aadhaar_back' | 'selfie') {
  return `/api/kyc/documents/${submissionId}/${kind}`;
}

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27]';

export default async function ResidentsKycVerifyPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { submissionId } = await params;
  const sub = await getKycSubmission(submissionId);
  if (!sub) notFound();

  const [customer] = await db
    .select({
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      kycStatus: customers.kycStatus,
    })
    .from(customers)
    .where(eq(customers.id, sub.customerId))
    .limit(1);

  const residentName = customer?.fullName ?? 'Resident';

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: 'KYC review', href: moduleHref('kyc') },
          { label: residentName },
        ]}
      />

      <PageHeader
        title={`Verify — ${residentName}`}
        description={
          customer
            ? `${customer.phone} · ${customer.email}`
            : sub.customerId
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={moduleHref('kyc')}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
            >
              ← KYC queue
            </Link>
            <Link
              href={`/admin/residents/${sub.customerId}`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
            >
              Resident profile
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={toneForStatus(sub.status)}>{titleCase(sub.status)}</Badge>
        <span className="text-apg-silver">Submitted {formatDateTime(sub.createdAt)}</span>
        {customer ? (
          <span className="text-apg-silver">Account KYC: {titleCase(customer.kycStatus)}</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="grid gap-4 sm:grid-cols-3">
          <DocPreview title="Aadhaar front" src={docUrl(submissionId, 'aadhaar_front')} />
          <DocPreview title="Aadhaar back" src={docUrl(submissionId, 'aadhaar_back')} />
          <DocPreview title="Selfie" src={docUrl(submissionId, 'selfie')} />
        </section>

        {sub.status === 'pending' ? (
          <KycReviewActions submissionId={submissionId} />
        ) : (
          <div className={`${SURFACE} p-4 text-sm text-apg-silver`}>
            This submission was {sub.status}
            {sub.reviewedAt ? ` on ${formatDateTime(sub.reviewedAt)}` : ''}.
            {sub.rejectionReason ? (
              <p className="mt-2 text-rose-300">Reason: {sub.rejectionReason}</p>
            ) : null}
            <Link
              href={moduleKycVerifyHref(submissionId)}
              className="mt-3 inline-block text-[#FF5A1F] hover:underline"
            >
              Refresh
            </Link>
          </div>
        )}
      </div>

      {sub.validationReport ? (
        <details className={`${SURFACE} mt-6 p-4 text-xs text-apg-silver`}>
          <summary className="cursor-pointer font-semibold text-white">
            Auto-validation report
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(sub.validationReport, null, 2)}
          </pre>
        </details>
      ) : null}
    </>
  );
}

function DocPreview({ title, src }: { title: string; src: string }) {
  return (
    <figure className={`${SURFACE} overflow-hidden`}>
      <figcaption className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white">
        {title}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="aspect-[4/3] w-full object-contain bg-black/20" />
    </figure>
  );
}
