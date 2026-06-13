const SENSITIVE_KEY_RE =
  /password|passwd|aadhaar|aadhar|pan|screenshot|paymentproof|payment_proof|paymentscreenshot|kyc|selfie|document|blob|token|secret|authorization|cookie/i;

const SENSITIVE_VALUE_RE =
  /data:image\/|blob:|https?:\/\/.*\/api\/.*proof|^[0-9]{12}$/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SENSITIVE_VALUE_RE.test(value);
}

/** Strip passwords, Aadhaar, payment screenshots, and other PII from analytics metadata. */
export function sanitizeAnalyticsMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) continue;
    if (isSensitiveValue(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = sanitizeAnalyticsMetadata(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter((v) => !isSensitiveValue(v));
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
