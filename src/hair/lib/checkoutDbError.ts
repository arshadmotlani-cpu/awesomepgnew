import { closeHairDb } from '@/src/hair/db/client';

type ErrShape = {
  code?: string;
  message?: string;
  cause?: { code?: string; message?: string };
};

function flattenMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Postgres killed the session because a transaction stopped issuing queries. That aborts the open transaction. */
export function isIdleInTransactionSessionTimeout(err: unknown): boolean {
  const message = flattenMessage(err);
  const shape = err as ErrShape;
  const code = shape.code ?? shape.cause?.code ?? '';
  const causeMsg = shape.cause?.message ?? '';
  const haystack = `${message} ${causeMsg}`;
  return code === '25P03' || /idle-in-transaction timeout/i.test(haystack);
}

/** postgres.js / Neon pooler connection loss (not proof that a transaction rolled back). */
export function isHairPostgresConnectionError(err: unknown): boolean {
  const message = flattenMessage(err);
  const shape = err as ErrShape;
  const code = shape.code ?? shape.cause?.code ?? '';
  const causeMsg = shape.cause?.message ?? '';
  const haystack = `${message} ${causeMsg}`;
  return (
    code === 'CONNECTION_CLOSED' ||
    code === 'CONNECT_TIMEOUT' ||
    code === 'ECONNRESET' ||
    /CONNECTION_CLOSED|CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|Connection terminated|socket hang up|Client has encountered a connection error/i.test(
      haystack,
    )
  );
}

/** Safe classifier for logs. Does not include SQL text or hostnames. */
export function checkoutErrorKind(err: unknown): string {
  if (isIdleInTransactionSessionTimeout(err)) return 'idle_timeout';
  const message = flattenMessage(err);
  const shape = err as ErrShape;
  const code = shape.code ?? shape.cause?.code ?? '';
  if (code === '25P03') return 'idle_timeout';
  if (code === 'CONNECTION_CLOSED' || /CONNECTION_CLOSED/i.test(message)) return 'connection_closed';
  if (code === 'CONNECT_TIMEOUT' || /CONNECT_TIMEOUT/i.test(message)) return 'connect_timeout';
  if (code === 'ECONNRESET' || /ECONNRESET/i.test(message)) return 'econnreset';
  if (code === '57P01') return 'admin_shutdown';
  if (code) return code;
  return 'other';
}

/** Drop the singleton pool so the next query opens a fresh Neon connection. */
export async function invalidateHairDbOnConnectionError(err: unknown): Promise<void> {
  if (!isHairPostgresConnectionError(err) && !isIdleInTransactionSessionTimeout(err)) return;
  await closeHairDb();
}

export type CheckoutDbLogStage =
  | 'claim_lease'
  | 'checkout_transaction'
  | 'finalize_operation'
  | 'reconcile'
  | 'recover';

export function logCheckoutDbEvent(
  stage: CheckoutDbLogStage,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  if (process.env.NODE_ENV === 'test') return;
  const payload = { scope: 'fyh_checkout', stage, ...fields };
  console.info(JSON.stringify(payload));
}
