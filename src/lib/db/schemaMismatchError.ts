/** Detect postgres/drizzle errors caused by code ahead of applied migrations. */
export function isDatabaseSchemaMismatchError(err: unknown): boolean {
  const message = errorMessage(err);
  return /column .* does not exist|relation .* does not exist|undefined column/i.test(message);
}

export function schemaMismatchHint(err: unknown): string {
  const message = errorMessage(err);
  if (/proof_snapshot_submitted_paise/i.test(message)) {
    return 'Run migration src/db/migrations/0122_proof_snapshot_submitted_paise.sql';
  }
  if (/proof_snapshot_/i.test(message)) {
    return 'Run migration src/db/migrations/0121_booking_payment_proof_snapshot.sql';
  }
  return 'Run pending database migrations (npm run db:migrate)';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
