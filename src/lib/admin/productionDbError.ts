/** Whether the app is running in a production deployment. */
export function isProductionDeployment(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

/** Operator-safe message — never expose migration / DATABASE_URL hints in production. */
export function sanitizeAdminQueryError(message: string): string {
  if (!isProductionDeployment()) return message;

  if (/DATABASE_URL|DATABASE URL|POSTGRES_URL/i.test(message)) {
    return 'Unable to connect to the database. Please try again in a few minutes.';
  }
  if (/ECONNREFUSED|connection refused|ETIMEDOUT|timeout/i.test(message)) {
    return 'The database is temporarily unavailable. Please try again shortly.';
  }
  if (/relation .* does not exist|42P01|migration|__drizzle_migrations/i.test(message)) {
    return 'A system update is in progress. Please refresh the page or contact support.';
  }
  return 'Unable to load this data right now. Please try again.';
}
