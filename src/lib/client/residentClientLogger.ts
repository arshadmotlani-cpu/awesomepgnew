type ResidentClientLogContext = {
  page: string;
  bookingId?: string | null;
  customerId?: string | null;
  email?: string | null;
  durationMode?: string | null;
  extra?: Record<string, unknown>;
};

/** Structured client-side logs for resident flows — always includes page + booking context. */
export function logResidentClientError(
  message: string,
  error: unknown,
  context: ResidentClientLogContext,
): void {
  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

  console.error('[resident-client]', message, {
    userId: context.customerId ?? null,
    customerId: context.customerId ?? null,
    email: context.email ?? null,
    bookingId: context.bookingId ?? null,
    page: context.page,
    durationMode: context.durationMode ?? null,
    ...context.extra,
    error: err,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
}

export function logResidentClientInfo(message: string, context: ResidentClientLogContext): void {
  console.info('[resident-client]', message, {
    userId: context.customerId ?? null,
    customerId: context.customerId ?? null,
    email: context.email ?? null,
    bookingId: context.bookingId ?? null,
    page: context.page,
    durationMode: context.durationMode ?? null,
  });
}
