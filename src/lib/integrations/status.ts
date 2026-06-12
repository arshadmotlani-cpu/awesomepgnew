import { env } from '@/src/lib/env';
import {
  BLOB_PRIVATE_ENV_VARS,
  BLOB_PUBLIC_ENV_VARS,
  checkBlobConnectivity,
  isBlobPrivateConfigured,
  isBlobPublicConfigured,
} from '@/src/lib/storage/blob';
import { isKycUploadAvailable, peekKycStorageBackend } from '@/src/lib/kyc/storage';
import { isRazorpayConfigured, razorpayConfigError } from '@/src/lib/payments/config';
import { isPaymentScreenshotUploadAvailable } from '@/src/lib/payments/screenshotUpload';

export type IntegrationStatus = 'ok' | 'degraded' | 'unavailable';

export type IntegrationsHealthSummary = {
  blob: {
    privateConfigured: boolean;
    publicConfigured: boolean;
    status: IntegrationStatus;
    connectivityOk: boolean | null;
    connectivityDetail: string | null;
    requiredPrivateVars: readonly string[];
    requiredPublicVars: readonly string[];
    missingPrivateVars: string[];
    missingPublicVars: string[];
  };
  kyc: {
    uploadsAvailable: boolean;
    status: IntegrationStatus;
    backend: 'blob' | 'filesystem' | null;
    requiresBlobOnVercel: boolean;
  };
  email: {
    configured: boolean;
    status: IntegrationStatus;
    provider: 'resend' | 'smtp' | null;
    requiredVars: string[];
    missingVars: string[];
  };
  razorpay: {
    configured: boolean;
    status: IntegrationStatus;
    provider: string;
    error: string | null;
    requiredVars: string[];
    missingVars: string[];
  };
  paymentProofUploads: {
    available: boolean;
    status: IntegrationStatus;
    backend: 'blob' | 'data-url' | null;
  };
};

function missingBlobPrivateVars(): string[] {
  return BLOB_PRIVATE_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

function missingBlobPublicVars(): string[] {
  if (isBlobPublicConfigured()) return [];
  return [...BLOB_PUBLIC_ENV_VARS];
}

function emailStatus(): IntegrationsHealthSummary['email'] {
  const hasFrom = Boolean(env.EMAIL_FROM);
  const hasResend = Boolean(env.RESEND_API_KEY);
  const hasSmtp = Boolean(env.SMTP_HOST);

  if (hasResend && hasFrom) {
    return {
      configured: true,
      status: 'ok',
      provider: 'resend',
      requiredVars: ['RESEND_API_KEY', 'EMAIL_FROM'],
      missingVars: [],
    };
  }

  if (hasSmtp && hasFrom) {
    return {
      configured: true,
      status: 'ok',
      provider: 'smtp',
      requiredVars: ['SMTP_HOST', 'EMAIL_FROM'],
      missingVars: [],
    };
  }

  const missing: string[] = [];
  if (!hasFrom) missing.push('EMAIL_FROM');
  if (!hasResend && !hasSmtp) missing.push('RESEND_API_KEY or SMTP_HOST');

  return {
    configured: false,
    status: env.NODE_ENV === 'production' ? 'unavailable' : 'degraded',
    provider: null,
    requiredVars: ['RESEND_API_KEY', 'EMAIL_FROM'],
    missingVars: missing,
  };
}

function razorpayStatus(): IntegrationsHealthSummary['razorpay'] {
  const provider = env.PAYMENT_PROVIDER;
  if (provider !== 'razorpay') {
    return {
      configured: true,
      status: 'ok',
      provider,
      error: null,
      requiredVars: [],
      missingVars: [],
    };
  }

  const error = razorpayConfigError();
  const requiredVars = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
  const missingVars = requiredVars.filter((name) => !process.env[name]?.trim());

  return {
    configured: isRazorpayConfigured(),
    status: error ? 'unavailable' : 'ok',
    provider,
    error,
    requiredVars,
    missingVars,
  };
}

function blobStatus(): IntegrationsHealthSummary['blob'] {
  const privateConfigured = isBlobPrivateConfigured();
  const publicConfigured = isBlobPublicConfigured();
  const missingPrivateVars = missingBlobPrivateVars();
  const missingPublicVars = missingBlobPublicVars();

  let status: IntegrationStatus = 'unavailable';
  if (privateConfigured && publicConfigured) status = 'ok';
  else if (privateConfigured || publicConfigured) status = 'degraded';

  return {
    privateConfigured,
    publicConfigured,
    status,
    connectivityOk: null,
    connectivityDetail: null,
    requiredPrivateVars: BLOB_PRIVATE_ENV_VARS,
    requiredPublicVars: BLOB_PUBLIC_ENV_VARS,
    missingPrivateVars,
    missingPublicVars,
  };
}

function paymentProofStatus(): IntegrationsHealthSummary['paymentProofUploads'] {
  const available = isPaymentScreenshotUploadAvailable();
  const backend = isBlobPrivateConfigured() ? 'blob' : available ? 'data-url' : null;
  return {
    available,
    status: available ? 'ok' : 'unavailable',
    backend,
  };
}

/** Non-throwing integration health for startup checks and admin diagnostics. */
export function getIntegrationsHealthSummary(): IntegrationsHealthSummary {
  const kycUploadsAvailable = isKycUploadAvailable();
  const backend = peekKycStorageBackend();
  const onVercel = process.env.VERCEL === '1';

  return {
    blob: blobStatus(),
    kyc: {
      uploadsAvailable: kycUploadsAvailable,
      status: kycUploadsAvailable ? 'ok' : 'unavailable',
      backend,
      requiresBlobOnVercel: onVercel && process.env.KYC_STORAGE !== 'filesystem',
    },
    email: emailStatus(),
    razorpay: razorpayStatus(),
    paymentProofUploads: paymentProofStatus(),
  };
}

/** Adds live Blob connectivity probe — use sparingly (startup / health API). */
export async function getIntegrationsHealthSummaryWithBlobProbe(): Promise<IntegrationsHealthSummary> {
  const summary = getIntegrationsHealthSummary();
  if (!summary.blob.privateConfigured) return summary;

  const probe = await checkBlobConnectivity();
  return {
    ...summary,
    blob: {
      ...summary.blob,
      connectivityOk: probe.ok,
      connectivityDetail: probe.detail,
      status: probe.ok
        ? summary.blob.status
        : summary.blob.status === 'ok'
          ? 'degraded'
          : summary.blob.status,
    },
  };
}

export function formatStartupIntegrationReport(summary: IntegrationsHealthSummary): string {
  return [
    `Blob private configured = ${summary.blob.privateConfigured ? 'YES' : 'NO'}`,
    `Blob public configured = ${summary.blob.publicConfigured ? 'YES' : 'NO'}`,
    `KYC uploads available = ${summary.kyc.uploadsAvailable ? 'YES' : 'NO'}`,
  ].join('; ');
}
