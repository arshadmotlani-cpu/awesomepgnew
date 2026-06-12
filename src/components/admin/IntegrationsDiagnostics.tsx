import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import type { IntegrationsHealthSummary } from '@/src/lib/integrations/status';

function toneForIntegration(status: string): 'emerald' | 'amber' | 'rose' {
  if (status === 'ok') return 'emerald';
  if (status === 'degraded') return 'amber';
  return 'rose';
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'degraded') return 'Degraded';
  return 'Unavailable';
}

type IntegrationRowProps = {
  name: string;
  status: string;
  detail: string;
  missingVars?: string[];
};

function IntegrationRow({ name, status, detail, missingVars }: IntegrationRowProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-900">{name}</p>
        <Badge tone={toneForIntegration(status)}>{statusLabel(status)}</Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-600">{detail}</p>
      {missingVars && missingVars.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
          {missingVars.map((key) => (
            <li key={key} className="font-mono">
              {key}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function IntegrationsDiagnostics({
  integrations,
  databaseStatus,
}: {
  integrations: IntegrationsHealthSummary;
  databaseStatus: string;
}) {
  const dbOk = databaseStatus === 'ok';
  const emailDetail = integrations.email.configured
    ? `Provider: ${integrations.email.provider}`
    : `Missing: ${integrations.email.missingVars.join(', ') || 'email provider vars'}`;
  const razorpayDetail = integrations.razorpay.error
    ? integrations.razorpay.error
    : integrations.razorpay.provider === 'razorpay'
      ? 'Razorpay credentials configured'
      : `Payment provider: ${integrations.razorpay.provider} (Razorpay vars not required)`;
  const kycDetail = integrations.kyc.uploadsAvailable
    ? `Backend: ${integrations.kyc.backend ?? 'unknown'}`
    : integrations.kyc.requiresBlobOnVercel
      ? 'Blocked on Vercel — private Blob store (BLOB_READ_WRITE_TOKEN) required for KYC uploads'
      : 'KYC uploads unavailable';
  const blobPrivateDetail = integrations.blob.privateConfigured
    ? integrations.blob.connectivityOk === false
      ? `Token set but connectivity failed: ${integrations.blob.connectivityDetail ?? 'unknown'}`
      : integrations.blob.connectivityOk === true
        ? integrations.blob.connectivityDetail ?? 'Private store reachable'
        : 'Private store token configured (KYC, payment proofs)'
    : 'Create a private Blob store in Vercel and set BLOB_READ_WRITE_TOKEN';
  const blobPublicDetail = integrations.blob.publicConfigured
    ? 'Public store configured (PG media, QR codes, meter photos)'
    : 'Create a public Blob store and set BLOB_PUBLIC_READ_WRITE_TOKEN for file uploads';
  const paymentProofDetail =
    integrations.paymentProofUploads.backend === 'blob'
      ? 'Uploads stored in Blob private store'
      : integrations.paymentProofUploads.backend === 'data-url'
        ? 'Local dev fallback: compressed data URLs'
        : 'Uploads blocked — configure BLOB_READ_WRITE_TOKEN on Vercel';

  return (
    <Card>
      <CardHeader
        title="Integrations & storage"
        description="Runtime status of external services. Vercel deployments need private Blob for KYC/payment proofs and public Blob for media uploads."
      />
      <CardBody className="space-y-3">
        <IntegrationRow
          name="Database"
          status={dbOk ? 'ok' : 'unavailable'}
          detail={dbOk ? 'Connection healthy' : `Status: ${databaseStatus}`}
        />
        <IntegrationRow
          name="Blob (private)"
          status={
            integrations.blob.privateConfigured && integrations.blob.connectivityOk !== false
              ? 'ok'
              : integrations.blob.privateConfigured
                ? 'degraded'
                : 'unavailable'
          }
          detail={blobPrivateDetail}
          missingVars={integrations.blob.missingPrivateVars}
        />
        <IntegrationRow
          name="Blob (public)"
          status={integrations.blob.publicConfigured ? 'ok' : 'degraded'}
          detail={blobPublicDetail}
          missingVars={integrations.blob.missingPublicVars}
        />
        <IntegrationRow
          name="KYC storage"
          status={integrations.kyc.status}
          detail={kycDetail}
        />
        <IntegrationRow
          name="Email"
          status={integrations.email.status}
          detail={emailDetail}
          missingVars={integrations.email.missingVars}
        />
        <IntegrationRow
          name="Razorpay"
          status={integrations.razorpay.status}
          detail={razorpayDetail}
          missingVars={integrations.razorpay.missingVars}
        />
        <IntegrationRow
          name="Payment proof uploads"
          status={integrations.paymentProofUploads.status}
          detail={paymentProofDetail}
        />
      </CardBody>
    </Card>
  );
}
