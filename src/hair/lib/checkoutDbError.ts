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

/** Drop the singleton pool so the next query opens a fresh Neon connection. */
export async function invalidateHairDbOnConnectionError(err: unknown): Promise<void> {
  if (!isHairPostgresConnectionError(err)) return;
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
