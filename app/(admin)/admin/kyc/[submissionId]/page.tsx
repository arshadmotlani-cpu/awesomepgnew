import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { KycReviewActions } from '@/src/components/admin/KycReviewActions';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getKycSubmission } from '@/src/services/kyc';
import { formatDateTime, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

type RouteParams = { submissionId: string };

function docUrl(submissionId: string, kind: 'aadhaar_front' | 'aadhaar_back' | 'selfie') {
  return `/api/kyc/documents/${submissionId}/${kind}`;
}

export default async function AdminKycDetailPage({
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

  return (
    <>
      <PageHeader
        title="KYC submission"
        description={
          customer
            ? `${customer.fullName} · ${customer.phone} · ${customer.email}`
            : sub.customerId
        }
        actions={
          <Link
            href="/admin/kyc"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            ← Pending queue
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={toneForStatus(sub.status)}>{titleCase(sub.status)}</Badge>
        <span className="text-zinc-500">Submitted {formatDateTime(sub.createdAt)}</span>
        {customer ? (
          <span className="text-zinc-500">
            Customer KYC: {titleCase(customer.kycStatus)}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="grid gap-4 sm:grid-cols-3">
          <DocPreview title="Aadhaar front" src={docUrl(submissionId, 'aadhaar_front')} />
          <DocPreview title="Aadhaar back" src={docUrl(submissionId, 'aadhaar_back')} />
          <DocPreview title="Selfie" src={docUrl(submissionId, 'selfie')} />
        </section>

        {sub.status === 'pending' ? (
          <KycReviewActions submissionId={submissionId} />
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            This submission was {sub.status}
            {sub.reviewedAt ? ` on ${formatDateTime(sub.reviewedAt)}` : ''}.
            {sub.rejectionReason ? (
              <p className="mt-2 text-rose-700">Reason: {sub.rejectionReason}</p>
            ) : null}
          </div>
        )}
      </div>

      {sub.validationReport ? (
        <details className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
          <summary className="cursor-pointer font-semibold text-zinc-800">
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
    <figure className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <figcaption className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700">
        {title}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="aspect-[4/3] w-full object-contain bg-zinc-50" />
    </figure>
  );
}
