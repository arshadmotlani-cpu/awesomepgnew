import type { ErrorEvent, Event } from '@sentry/nextjs';

const SENSITIVE_KEY_RE =
  /password|passwd|aadhaar|aadhar|pan|screenshot|paymentproof|payment_proof|paymentscreenshot|kyc|selfie|document|token|secret|authorization|cookie/i;

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/data:image\//i.test(value)) return '[redacted:image]';
    if (/^[0-9]{12}$/.test(value)) return '[redacted:aadhaar]';
    if (value.length > 500 && /base64/i.test(value)) return '[redacted:payload]';
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') return scrubObject(value as Record<string, unknown>);
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = scrubValue(value);
  }
  return out;
}

/** Remove Aadhaar, passwords, payment screenshots, and KYC personal data from Sentry events. */
export function scrubSentryEvent<T extends Event>(event: T): T | null {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = scrubObject(
        event.request.headers as Record<string, unknown>,
      ) as typeof event.request.headers;
    }
    if (event.request.data) {
      event.request.data = scrubValue(event.request.data);
    }
    if (event.request.cookies) {
      delete event.request.cookies;
    }
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }

  if (event.contexts) {
    event.contexts = scrubObject(event.contexts as Record<string, unknown>) as typeof event.contexts;
  }

  if ('exception' in event && event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value && SENSITIVE_KEY_RE.test(ex.value)) {
        ex.value = '[redacted:error]';
      }
    }
  }

  return event;
}

export function scrubSentryErrorEvent(event: ErrorEvent): ErrorEvent | null {
  return scrubSentryEvent(event);
}
