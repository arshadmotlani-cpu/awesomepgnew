import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { KycReviewActions } from '@/src/components/admin/KycReviewActions';
import { KycVerifyAdvancedTools } from '@/src/components/admin/kyc/KycVerifyAdvancedTools';
import { KycVerifyPrimaryActions } from '@/src/components/admin/kyc/KycVerifyPrimaryActions';
import { KycVerifySummarySection } from '@/src/components/admin/kyc/KycVerifySummarySection';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getKycSubmission } from '@/src/services/kyc';
import {
  ADMIN_MODULES,
  moduleHref,
} from '@/src/lib/admin/navigation';
import { KYC_DOCUMENT_LABELS, kycDocumentUrl } from '@/src/lib/kyc/documentUrls';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

type RouteParams = { submissionId: string };

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27]';

export default async function ResidentsKycVerifyPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { submissionId } = await params;
  await ensureAdminPageNotificationsSeen(
    `/admin/residents/kyc/${submissionId}`,
    `/admin/residents/kyc/${submissionId}`,
  );
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
  const isPending = sub.status === 'pending';

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: 'Identity checks', href: moduleHref('kyc') },
          { label: residentName },
        ]}
      />

      <PageHeader
        title={`Review — ${residentName}`}
        description={
          customer
            ? `${customer.phone} · ${customer.email}`
            : sub.customerId
        }
      />

      <KycVerifySummarySection
        submissionStatus={sub.status}
        submittedAt={sub.createdAt}
        accountKycStatus={customer?.kycStatus}
        reviewedAt={sub.reviewedAt}
        rejectionReason={sub.rejectionReason}
      />

      <KycVerifyPrimaryActions customerId={sub.customerId} isPending={isPending} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="grid gap-4 sm:grid-cols-3">
          <DocPreview
            title={KYC_DOCUMENT_LABELS.aadhaar_front}
            src={kycDocumentUrl(submissionId, 'aadhaar_front')}
          />
          <DocPreview
            title={KYC_DOCUMENT_LABELS.aadhaar_back}
            src={kycDocumentUrl(submissionId, 'aadhaar_back')}
          />
          <DocPreview
            title={KYC_DOCUMENT_LABELS.selfie}
            src={kycDocumentUrl(submissionId, 'selfie')}
          />
        </section>

        {isPending ? (
          <KycReviewActions submissionId={submissionId} />
        ) : (
          <div className={`${SURFACE} space-y-3 p-4 text-sm text-apg-silver`}>
            <p className="font-semibold text-white">Already decided</p>
            <p>
              This submission was reviewed
              {sub.reviewedAt ? '.' : ' — open Advanced tools below for the PDF.'}
            </p>
            <Link
              href={`/admin/residents/${sub.customerId}`}
              className="inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
            >
              Open resident profile
            </Link>
          </div>
        )}
      </div>

      <KycVerifyAdvancedTools
        submissionId={submissionId}
        status={sub.status}
        aadhaarFrontPath={sub.aadhaarFrontPath}
        aadhaarBackPath={sub.aadhaarBackPath}
        validationReport={sub.validationReport}
      />
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
