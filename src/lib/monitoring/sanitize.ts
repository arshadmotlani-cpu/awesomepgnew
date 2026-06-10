const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'secret',
  'authorization',
  'cookie',
  'otp',
  'razorpay_key_secret',
  'auth_secret',
  'smtp_pass',
  'resend_api_key',
]);

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return true;
  return (
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('authorization')
  );
}

export function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/Bearer\s+/i.test(value)) return 'Bearer [REDACTED]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMeta(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : sanitizeMeta(val, depth + 1);
    }
    return out;
  }
  return value;
}
