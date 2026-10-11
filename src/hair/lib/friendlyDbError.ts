import { randomUUID } from 'node:crypto';

type PgCause = { code?: string; message?: string };

function postgresCause(err: unknown): PgCause | null {
  if (!err || typeof err !== 'object') return null;
  const anyErr = err as { cause?: PgCause; code?: string; message?: string };
  if (anyErr.cause && typeof anyErr.cause === 'object') {
    return anyErr.cause as PgCause;
  }
  if (anyErr.code) return { code: anyErr.code, message: anyErr.message };
  return null;
}

/** Map Hair/FYH database errors to safe customer-facing checkout messages. */
export function friendlyHairDbError(err: unknown, correlationId?: string): string {
  const ref = correlationId ?? randomUUID().slice(0, 8);
  const message = err instanceof Error ? err.message : String(err);
  const pg = postgresCause(err);

  if (
    pg?.code === '42703' &&
    (/checkout_attempt_key/i.test(pg.message ?? '') || /checkout_attempt_key/i.test(message))
  ) {
    return `Billing database schema is not up to date (checkout idempotency). Run Hair migration 0054, then retry. Reference: ${ref}`;
  }

  if (pg?.code === '42P01' && /fyh_checkout_operations/i.test(message)) {
    return `Billing database schema is not up to date (checkout operations). Run Hair migration 0054, then retry. Reference: ${ref}`;
  }

  if (/Failed query:/i.test(message)) {
    return `Could not save this sale due to a database error. Verify Billing before retrying. Reference: ${ref}`;
  }

  if (pg?.code === '23505') {
    return `This sale may already exist. Check Billing before submitting again. Reference: ${ref}`;
  }

  return message.length > 200 ? `Could not complete checkout. Reference: ${ref}` : message;
}
